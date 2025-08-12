from django.contrib.auth.base_user import BaseUserManager
from django.db import models
import hashlib

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
class CustomUserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('The Username must be set')
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault('is_suspended', False)
        user = self.create_user(username, password, **extra_fields)
        return user

class CustomUser(AbstractBaseUser, PermissionsMixin):
    id = models.AutoField(primary_key=True)

    first_name = models.CharField(max_length=30, blank=True)
    last_name = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    profile_picture = models.ImageField(upload_to='profile_pics/', blank=True, null=True)

    email = models.EmailField(unique=True, blank=False, null=False)
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=256)
    department = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    failed_login_timestamp = models.DateTimeField(null=True, blank=True)
    is_suspended = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)

    objects = CustomUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['department', 'role']

    def __str__(self):
        return self.username

    def set_password(self, raw_password):
        self.password = hashlib.sha256(raw_password.encode()).hexdigest()

    def check_password(self, raw_password):
        return self.password == hashlib.sha256(raw_password.encode()).hexdigest()


class ActivityLogs(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    activity_type = models.CharField(max_length=100)
    resource_accessed = models.TextField(blank=True)
    action_result = models.TextField(blank=True)
    timestamp = models.DateTimeField()
    is_suspicious = models.BooleanField(default=False)
    details = models.TextField(blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.activity_type} - {self.timestamp}"


class Alerts(models.Model):
    log = models.OneToOneField(ActivityLogs, on_delete=models.CASCADE)
    score = models.FloatField()
    status = models.CharField(max_length=50, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    assigned_to = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_alerts')
    notes = models.TextField(blank=True)
    reason = models.TextField(blank=True, null=True)


    def __str__(self):
        return f"Alert for {self.log.id} - Score {self.score}"


class ThreatRules(models.Model):
    activity_type = models.CharField(max_length=100)
    score_threshold = models.FloatField()
    description = models.TextField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Rule: {self.activity_type}"


class AuditLogs(models.Model):
    admin_user = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)
    target_user = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, related_name='targeted_logs')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.TextField(blank=True)

    def __str__(self):
        return f"{self.action} by {self.admin_user} on {self.timestamp}"


class UserDailyAgg(models.Model):
    """
    One row per user per calendar day of aggregated behavior.
    Used for real-time scoring & cold-start handling.
    """
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, db_index=True)
    day = models.DateField(db_index=True)

    number_of_emails_dispatched = models.IntegerField(default=0)
    number_of_files_interacted = models.IntegerField(default=0)
    total_logon_attempts = models.IntegerField(default=0)
    usb_connection_incidents = models.IntegerField(default=0)
    nighttime_email_events = models.IntegerField(default=0)
    number_of_night_logons = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'day')

    def __str__(self):
        return f"{self.user.username} - {self.day}"


class CohortBaseline(models.Model):
    cohort_role = models.CharField(max_length=50, blank=True, db_index=True)
    cohort_department = models.CharField(max_length=100, blank=True, db_index=True)
    feature_name = models.CharField(max_length=100, db_index=True)

    # robust stats
    median = models.FloatField(default=0.0)
    mad = models.FloatField(default=0.0)

    # rolling/summary stats (these are what rebuild_cohort is writing)
    mean_7d  = models.FloatField(default=0.0)
    std_7d   = models.FloatField(default=0.0)
    mean_14d = models.FloatField(default=0.0)
    std_14d  = models.FloatField(default=0.0)
    mean_30d = models.FloatField(default=0.0)
    std_30d  = models.FloatField(default=0.0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('cohort_role', 'cohort_department', 'feature_name')


class ModelConfig(models.Model):
    """
    Stores trained model path and scoring thresholds.
    """
    name = models.CharField(max_length=100, default='daily_xgb', unique=True)
    bundle_path = models.CharField(max_length=255)
    decision_threshold = models.FloatField(default=0.9)
    alert_rate = models.FloatField(default=0.001)
    trained_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


