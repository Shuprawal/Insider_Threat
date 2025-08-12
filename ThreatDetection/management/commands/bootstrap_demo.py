# ThreatDetection/management/commands/bootstrap_demo.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.core import management
from datetime import timedelta
import numpy as np
import random

from ...models import (
    CustomUser, ActivityLogs, UserDailyAgg, CohortBaseline, ModelConfig
)

# ---------------------------
# Cohorts and users to create
# ---------------------------
DAY_SHIFT_USERS = [
    ("ramm",   "Analyst",  "Finance"),
    ("mira",   "Analyst",  "Finance"),
    ("bikash", "Engineer", "IT"),
    ("saru",   "Engineer", "IT"),
    ("lisa",   "Manager",  "HR"),
]

NIGHT_SHIFT_USERS = [
    ("nina",   "NightOps", "SOC"),
    ("kiran",  "NightOps", "SOC"),
]  # ← **night workers** who behave normally at night

DEMO_DAYS_TO_SYNTHESIZE = 30
RNG = np.random.default_rng(424242)


# ------------- helpers with long, distinctive names ----------------
def draw_integer_from_poisson_with_floor(mean_value: float, minimum: int = 0) -> int:
    """Poisson sampler that never returns below 'minimum'."""
    return max(minimum, int(RNG.poisson(lam=max(mean_value, 0.01))))


def choose_random_minute_in_block(start_hour: int, end_hour_inclusive: int) -> int:
    """Return a minute offset from 00:00 for a uniformly random time in [start_hour, end_hour]."""
    h = RNG.integers(start_hour, end_hour_inclusive + 1)
    m = RNG.integers(0, 60)
    return h * 60 + m


def synthesize_demonstration_activity_for_user_over_calendar_span(
    user, day_start_dt, number_of_days, is_night_shift=False
):
    """
    Emit ActivityLogs + UserDailyAgg for 'number_of_days'.
    Night‑shift users have heavy activity 23:00–05:59; day‑shift users are 08:00–18:59.
    Weekends have reduced intensity for both cohorts.
    """
    for d in range(number_of_days):
        day = (day_start_dt + timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        weekday = day.weekday()
        is_weekend = weekday >= 5

        # base intensities
        if is_night_shift:
            base_email = 10
            base_files = 8
            base_logon = 5
            base_usb   = 0.15
            # night heavy, day light
            weight_day, weight_night = (0.4, 1.6)
        else:
            base_email = 14
            base_files = 16
            base_logon = 6
            base_usb   = 0.10
            # day heavy, night light
            weight_day, weight_night = (1.4, 0.4)

        # weekend reduction
        weekend_multiplier = 0.6 if is_weekend else 1.0

        # sample counts
        emails_day  = draw_integer_from_poisson_with_floor(base_email * weight_day * weekend_multiplier)
        emails_night = draw_integer_from_poisson_with_floor(base_email * weight_night * weekend_multiplier * 0.6)

        files_day   = draw_integer_from_poisson_with_floor(base_files * weight_day * weekend_multiplier)
        files_night = draw_integer_from_poisson_with_floor(base_files * weight_night * weekend_multiplier * 0.4)

        logons_day  = draw_integer_from_poisson_with_floor(base_logon * weight_day * weekend_multiplier, minimum=1)
        logons_night = draw_integer_from_poisson_with_floor(base_logon * weight_night * weekend_multiplier)

        usb_day     = draw_integer_from_poisson_with_floor(base_usb * weight_day * weekend_multiplier)
        usb_night   = draw_integer_from_poisson_with_floor(base_usb * weight_night * weekend_multiplier)

        # write events
        def create_events(count, kind, block):
            if block == "day":
                for _ in range(count):
                    minutes = choose_random_minute_in_block(8, 18)
                    ts = day + timedelta(minutes=int(minutes))
                    ActivityLogs.objects.create(user=user, activity_type=kind, timestamp=ts, action_result="ok")
            else:
                # night block crosses midnight: sample in [23..23] and [0..5]
                for _ in range(count):
                    if RNG.random() < 0.5:
                        minutes = choose_random_minute_in_block(23, 23)
                    else:
                        minutes = choose_random_minute_in_block(0, 5)
                    ts = day + timedelta(minutes=int(minutes))
                    ActivityLogs.objects.create(user=user, activity_type=kind, timestamp=ts, action_result="ok")

        create_events(emails_day,  "email_sent",   "day")
        create_events(emails_night,"email_sent",   "night")
        create_events(files_day,   "file_accessed","day")
        create_events(files_night, "file_accessed","night")
        create_events(logons_day,  "logon",        "day")
        create_events(logons_night,"logon",        "night")
        create_events(usb_day,     "usb_inserted", "day")
        create_events(usb_night,   "usb_inserted", "night")

        # daily aggregate row
        UserDailyAgg.objects.create(
            user=user, day=day.date(),
            number_of_emails_dispatched=emails_day + emails_night,
            number_of_files_interacted=files_day + files_night,
            total_logon_attempts=logons_day + logons_night,
            usb_connection_incidents=usb_day + usb_night,
            nighttime_email_events=emails_night,
            number_of_night_logons=logons_night,
        )


def ensure_singleton_modelconfig_row_if_missing(bundle_path: str, decision_threshold: float, alert_rate: float):
    ModelConfig.objects.get_or_create(
        name="daily_xgb",
        defaults={
            "bundle_path": bundle_path,
            "decision_threshold": decision_threshold,
            "alert_rate": alert_rate,
        }
    )


# -------------------- main management command --------------------
class Command(BaseCommand):
    help = "Create demo users (day & night shift), synthesize realistic logs, build daily aggregates, and rebuild cohort baselines."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true",
                            help="Run even if data already exists (old demo data is cleared first).")
        parser.add_argument("--days", type=int, default=DEMO_DAYS_TO_SYNTHESIZE,
                            help="How many days of synthetic history to create (default: 30).")

    @transaction.atomic
    def handle(self, *args, **opts):
        force = opts["force"]
        n_days = int(opts["days"])

        if not force and ActivityLogs.objects.exists():
            self.stdout.write(self.style.WARNING(
                "ActivityLogs already exist → skipping bootstrap. Use --force to regenerate."
            ))
            return

        # clear previous demo data (safe because it's demo)
        ActivityLogs.objects.all().delete()
        UserDailyAgg.objects.all().delete()
        CohortBaseline.objects.all().delete()

        # create users if missing
        created = 0
        for uname, role, dept in DAY_SHIFT_USERS + NIGHT_SHIFT_USERS:
            if not CustomUser.objects.filter(username=uname).exists():
                CustomUser.objects.create_user(
                    username=uname,
                    password="password123",
                    email=f"{uname}@example.com",
                    role=role,
                    department=dept,
                    is_active=True,
                    is_suspended=False,
                )
                created += 1
        self.stdout.write(self.style.SUCCESS(f"Users created (if missing): {created}"))

        # synthesize logs
        now = timezone.now()
        start = (now - timedelta(days=n_days)).replace(hour=0, minute=0, second=0, microsecond=0)

        for uname, role, dept in DAY_SHIFT_USERS:
            synthesize_demonstration_activity_for_user_over_calendar_span(
                CustomUser.objects.get(username=uname),
                start, n_days, is_night_shift=False
            )
        for uname, role, dept in NIGHT_SHIFT_USERS:
            synthesize_demonstration_activity_for_user_over_calendar_span(
                CustomUser.objects.get(username=uname),
                start, n_days, is_night_shift=True
            )

        self.stdout.write(self.style.SUCCESS("Synthetic logs + daily aggregates created for day & night cohorts."))

        # rebuild cohort baselines (global; you can also call per role/department if you want)
        management.call_command("rebuild_cohort")
        self.stdout.write(self.style.SUCCESS("Cohort baselines rebuilt."))

        # ensure model config exists
        ensure_singleton_modelconfig_row_if_missing(
            bundle_path="ai_model/final_hybrid_threat_model_daily.pkl",
            decision_threshold=0.90,
            alert_rate=0.001,
        )
        self.stdout.write(self.style.SUCCESS("ModelConfig ensured."))
        self.stdout.write(self.style.SUCCESS("✅ Demo bootstrap completed."))
