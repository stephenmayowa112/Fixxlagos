"""
Pytest suite for Phase 1 Django backend (ACC-01..06, REP-01..12).
"""
from apps.api.reports.tasks import ConsoleSmsFake


def test_console_sms_fake_masks_phone_and_delivers():
    gateway = ConsoleSmsFake()
    res = gateway.send_otp("+2348031234567", "482910", reference_ttl_minutes=10)
    assert res["delivered"] is True
    assert res["provider"] == "console_fake"
    assert res["masked_phone"] == "+234***567"
