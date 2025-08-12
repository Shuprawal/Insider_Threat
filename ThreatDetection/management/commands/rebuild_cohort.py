# core/management/commands/rebuild_cohort.py
from django.core.management.base import BaseCommand
import numpy as np
from ThreatDetection.models import CustomUser, UserDailyAgg, CohortBaseline

FEATURES = [
    'number_of_emails_dispatched',
    'total_logon_attempts',
    'number_of_files_interacted',
    'usb_connection_incidents',
    'nighttime_email_events',
    'number_of_night_logons',
]

def mad(x):
    med = np.median(x)
    return float(np.median(np.abs(x - med)))

class Command(BaseCommand):
    help = "Rebuild cohort (median/MAD and approximate rolling stats) from known-normal users"

    def add_arguments(self, parser):
        parser.add_argument('--role', default='', help='Filter cohort by role (optional)')
        parser.add_argument('--department', default='', help='Filter cohort by department (optional)')
        parser.add_argument('--usernames', nargs='*', help='Explicit list of normal usernames')

    def handle(self, *args, **opts):
        role = opts['role']
        dept = opts['department']
        usernames = opts['usernames']

        qs = CustomUser.objects.filter(is_suspended=False, is_active=True)
        if role:
            qs = qs.filter(role__iexact=role)
        if dept:
            qs = qs.filter(department__iexact=dept)
        if usernames:
            qs = qs.filter(username__in=usernames)

        users = list(qs.values_list('id', flat=True))
        if not users:
            self.stdout.write(self.style.WARNING("No cohort users found."))
            return

        agg_qs = UserDailyAgg.objects.filter(user_id__in=users)
        if not agg_qs.exists():
            self.stdout.write(self.style.WARNING("No daily aggregates for cohort users."))
            return

        # compute robust stats per feature
        stats = {}
        for f in FEATURES:
            arr = np.array(list(agg_qs.values_list(f, flat=True)), dtype=float)
            if arr.size == 0:
                med = md = 0.0
                m7 = s7 = m14 = s14 = m30 = s30 = 0.0
            else:
                med = float(np.median(arr))
                md  = float(mad(arr))
                # population approximations for rolling means/stds
                m7  = float(np.mean(arr)); s7  = float(np.std(arr))
                m14 = m7;                   s14 = s7
                m30 = m7;                   s30 = s7
            stats[f] = dict(
                median=med, mad=md,
                mean_7d=m7, std_7d=s7,
                mean_14d=m14, std_14d=s14,
                mean_30d=m30, std_30d=s30
            )

        # upsert rows in CohortBaseline
        for f, v in stats.items():
            CohortBaseline.objects.update_or_create(
                cohort_role=role, cohort_department=dept, feature_name=f,
                defaults=v
            )

        self.stdout.write(self.style.SUCCESS(
            f"Updated baselines for role='{role or '*'}' dept='{dept or '*'}'."
        ))
