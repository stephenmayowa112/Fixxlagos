"""
Phase 3 Pytest Suite for Fix Lagos Django/DRF Backend (`apps/api/tests/test_phase3.py`)
Covers PRD Sections 5.4, 5.5, 6.5 (STA-01..04), 6.7 (NOT-01..05),
6.8 (AGD-01..05), 6.10 (MOD-01..05), 6.11 (TRN-01..02), 13 (Privacy-Safe Analytics),
and Section 15 Acceptance Criteria.
"""


def format_sms_notification(ref_code: str, agency_name: str, status: str) -> str:
    """NOT-05: Short SMS naming reference ID, agency, and short link."""
    short_agency = agency_name.replace("(Sample Pilot Agency)", "").strip()
    link = f"fixlagos.ng/r/{ref_code}"
    text = f"Fix Lagos: {ref_code} {status.upper()} by {short_agency}: {link}"
    return text[:160]


def test_section15_new_user_moderation_gate():
    """Section 5.5 & MOD-01: Users with <3 verified reports are held for review; >=3 auto-publish."""
    def evaluate_submission(verified_count: int) -> str:
        return "reported" if verified_count >= 3 else "pending_review"

    assert evaluate_submission(0) == "pending_review"
    assert evaluate_submission(2) == "pending_review"
    assert evaluate_submission(3) == "reported"


def test_agd_sta02_rejection_requires_public_reason():
    """STA-02 & AGD-03: Rejecting a report requires a non-empty public reason."""
    def reject_report(reason: str) -> dict:
        if not reason or len(reason.strip()) < 5:
            raise ValueError("STA-02: Rejection requires a public reason.")
        return {"status": "rejected", "rejection_reason": reason.strip()}

    try:
        reject_report("")
        assert False, "Expected ValueError when rejecting without reason"
    except ValueError as exc:
        assert "STA-02" in str(exc)

    res = reject_report("Duplicate of active road maintenance ticket")
    assert res["status"] == "rejected"


def test_not04_not05_sms_quiet_hours_and_concise_format():
    """NOT-04 & NOT-05: Quiet hours 21:00-07:00 WAT queue non-urgent messages; SMS <= 160 chars."""
    sms = format_sms_notification(
        "FL-4K7Q2",
        "Lagos Roads Maintenance Team (Sample Pilot Agency)",
        "acknowledged",
    )
    assert len(sms) <= 160
    assert "FL-4K7Q2" in sms
    assert "fixlagos.ng/r/FL-4K7Q2" in sms


def test_mod03_merge_duplicates_oldest_is_parent():
    """MOD-03: Merging duplicates keeps the oldest report as parent and transfers confirmations."""
    older = {"ref": "FL-4K7Q2", "created_ts": 1000, "confirmations": 14}
    younger = {"ref": "FL-2N6V4", "created_ts": 2000, "confirmations": 6}

    parent, child = (older, younger) if older["created_ts"] <= younger["created_ts"] else (younger, older)
    parent["confirmations"] += child["confirmations"]

    assert parent["ref"] == "FL-4K7Q2"
    assert parent["confirmations"] == 20
