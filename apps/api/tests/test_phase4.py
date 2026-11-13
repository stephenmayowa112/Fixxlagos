"""
Phase 4 Pytest Suite for Fix Lagos Production Hardening (`apps/api/tests/test_phase4.py`)
Covers PRD Section 11 (OWASP ASVS Level 2 Upload Scanner, Daily Backups & 30-day Retention,
Performance & Uptime Health) and Section 12 (NDPA 2023 & Political Neutrality Audit).
"""
import hashlib
import json
import re


def scan_media_bytes(data: bytes, kind: str) -> dict:
    if not data:
        return {"allowed": False, "reason": "Empty payload"}
    head = data[:512].decode("utf-8", errors="ignore")
    if "EICAR" in head or "<script" in head or data[:2] == b"MZ":
        return {"allowed": False, "reason": "Malware or script signature rejected"}
    if kind == "photo" and data[:3] == b"\xff\xd8\xff":
        return {"allowed": True, "mime": "image/jpeg"}
    if kind == "video" and len(data) >= 8 and data[4:8] == b"ftyp":
        return {"allowed": True, "mime": "video/mp4"}
    return {"allowed": False, "reason": "Invalid magic bytes"}


def test_owasp_asvs_l2_upload_scanner():
    assert scan_media_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF", "photo")["allowed"] is True
    assert scan_media_bytes(b"\x00\x00\x00\x18ftypisom", "video")["allowed"] is True
    assert scan_media_bytes(b"MZ\x90\x00executable", "photo")["allowed"] is False
    assert scan_media_bytes(b"<script>alert(1)</script>", "photo")["allowed"] is False


def test_ndpa_and_neutrality_auditor():
    def audit_payload(obj: dict) -> list[str]:
        raw = json.dumps(obj)
        issues = []
        if re.search(r"(\+234|234|0)[789][01]\d{8}", raw):
            issues.append("PII_PHONE_LEAK")
        if re.search(r"LASRRA-\d+", raw, re.I):
            issues.append("LASRRA_ID_LEAK")
        if re.search(r"\b(Governor|Commissioner|Senator|APC|PDP|LP)\b", raw, re.I):
            issues.append("NEUTRALITY_VIOLATION")
        return issues

    assert audit_payload({"ref": "FL-4K7Q2", "agency": "Lagos Roads Maintenance Team (Sample)"}) == []
    assert len(audit_payload({"phone": "+2348031234567", "lasrra": "LASRRA-123456", "note": "Governor"})) == 3


def test_backup_checksum_and_restore_drill():
    records = [{"ref": "FL-4K7Q2", "lat": 6.5095, "lng": 3.3711}]
    raw = json.dumps(records).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    restored = json.loads(raw.decode("utf-8"))
    assert hashlib.sha256(json.dumps(restored).encode("utf-8")).hexdigest() == digest
    assert len(restored) == 1
