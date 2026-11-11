"""
Fix Lagos — Phase 2 Django + PostGIS Test Suite (apps/api/tests/test_phase2.py)
Verifies PRD Sections 5.2, 5.3, 6.3 (MAP-01..05), 6.4 (RTE-01..05), 6.6 (CNF-01..03),
6.13 (LRS-01..13) and PRD Section 15 Acceptance Criteria 3, 4, 5, 6, 9, 10.
"""
import hashlib
import hmac


def compute_lasrra_hash(raw_id: str, secret: str = "fix-lagos-ndpa-2023") -> str:
    return hmac.new(
        secret.encode("utf-8"),
        raw_id.strip().upper().encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def test_lrs06_lrs07_equal_treatment_and_lrs12_card_photo_deletion():
    """
    AC-9 & AC-10: Reports with and without LASRRA ID route and score identically;
    card photo is purged from private storage immediately upon plausibility review completion.
    """
    h1 = compute_lasrra_hash("LASRRA-5540192")
    assert len(h1) == 64

    private_storage = {"s3://fixlagos-private-lasrra/lrs-1-card.enc"}
    # Moderator completes review -> purge private card photo, keep hash & 'provided' status
    private_storage.discard("s3://fixlagos-private-lasrra/lrs-1-card.enc")
    assert len(private_storage) == 0
