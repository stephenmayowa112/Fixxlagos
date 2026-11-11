"""
Django 5.1 + PostGIS + Celery + DRF models for Fix Lagos (PRD Section 7).
Implements User, ResidentVerification, Agency, JurisdictionArea, Category,
RoutingRule, Report, ReportMedia, StatusEvent, Confirmation, Flag, Notification, AuditLog.
"""
import hashlib
import hmac
import uuid
from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


def compute_pii_hash(raw_value: str) -> str:
    secret = getattr(settings, "PII_HMAC_KEY", "dev-local-hmac-key").encode("utf-8")
    normalized = raw_value.strip().upper().encode("utf-8")
    return hmac.new(secret, normalized, hashlib.sha256).hexdigest()


class User(models.Model):
    class Role(models.TextChoices):
        CITIZEN = "citizen", "Citizen"
        AGENCY_OFFICER = "agency_officer", "Agency Officer"
        AGENCY_SUPERVISOR = "agency_supervisor", "Agency Supervisor"
        MODERATOR = "moderator", "Moderator"
        SUPER_ADMIN = "super_admin", "Super Admin"

    class ResidentStatus(models.TextChoices):
        NONE = "none", "No ID"
        PROVIDED = "provided", "ID provided"
        VERIFIED = "verified", "Verified resident"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_encrypted = models.BinaryField(null=True, blank=True)
    phone_hash = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    display_name = models.CharField(max_length=80, blank=True, default="")
    public_name_opt_in = models.BooleanField(default=False)
    role = models.CharField(max_length=24, choices=Role.choices, default=Role.CITIZEN)
    trust_level = models.PositiveSmallIntegerField(default=0)
    resident_status = models.CharField(
        max_length=16, choices=ResidentStatus.choices, default=ResidentStatus.NONE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def anonymise_for_deletion(self) -> None:
        """NDPA 2023 account deletion (ACC-04, LRS-12): erase PII, retain infrastructure history."""
        from django.utils import timezone

        self.phone_encrypted = None
        self.phone_hash = None
        self.display_name = ""
        self.public_name_opt_in = False
        self.resident_status = self.ResidentStatus.NONE
        self.deleted_at = timezone.now()
        self.save()


class ResidentVerification(models.Model):
    """LRS-08..LRS-13: Optional LASRRA ID verification record."""

    class Status(models.TextChoices):
        NONE = "none", "None"
        PROVIDED = "provided", "ID provided"
        VERIFIED = "verified", "Verified resident"
        REJECTED = "rejected", "Rejected"

    class VerifiedVia(models.TextChoices):
        MANUAL = "manual", "Moderator Plausibility Review"
        LASRRA_CHECK = "lasrra_check", "Official LASRRA Lookup (Phase 2)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="resident_verification")
    id_number_encrypted = models.BinaryField()
    id_number_hash = models.CharField(max_length=64, unique=True, db_index=True)
    card_photo_key = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROVIDED)
    verified_via = models.CharField(max_length=20, choices=VerifiedVia.choices, default=VerifiedVia.MANUAL)
    reviewed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_verifications"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Agency(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    type = models.CharField(max_length=64)
    contact_email = models.EmailField()
    sla_ack_days = models.PositiveSmallIntegerField(default=7)
    active = models.BooleanField(default=True)


class JurisdictionArea(models.Model):
    class Level(models.TextChoices):
        STATE = "state", "State"
        LGA = "LGA", "LGA"
        LCDA = "LCDA", "LCDA"
        WARD = "ward", "Ward"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    level = models.CharField(max_length=16, choices=Level.choices)
    geometry = gis_models.MultiPolygonField(srid=4326)


class Category(models.Model):
    id = models.CharField(max_length=40, primary_key=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=80)
    icon = models.CharField(max_length=40)
    default_severity = models.CharField(max_length=16, default="medium")
    active = models.BooleanField(default=True)


class RoutingRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    area = models.ForeignKey(JurisdictionArea, on_delete=models.CASCADE)
    road_owner = models.CharField(max_length=16, default="state")
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE)
    priority = models.PositiveSmallIntegerField(default=10)


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_code = models.CharField(max_length=12, unique=True, db_index=True)
    idempotency_key = models.CharField(max_length=64, unique=True)
    reporter = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    note = models.CharField(max_length=280, blank=True, default="")
    location = gis_models.PointField(geography=True, srid=4326, spatial_index=True)
    accuracy_m = models.FloatField(default=15.0)
    area = models.ForeignKey(JurisdictionArea, null=True, blank=True, on_delete=models.SET_NULL)
    severity = models.CharField(max_length=16, default="medium")
    is_dangerous = models.BooleanField(default=False)
    status = models.CharField(max_length=24, default="reported")
    agency = models.ForeignKey(Agency, null=True, blank=True, on_delete=models.SET_NULL)
    duplicate_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    confirmation_count = models.PositiveIntegerField(default=0)
    priority_score = models.FloatField(default=20.0)
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    fixed_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "agency", "-priority_score"], name="idx_report_queue_priority"),
            models.Index(fields=["category", "-created_at"], name="idx_report_cat_created"),
        ]
