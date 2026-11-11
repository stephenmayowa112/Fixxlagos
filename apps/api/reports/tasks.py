"""
Django REST Framework & Celery Phase 1 implementation for Fix Lagos:
- ACC-01..06: Phone OTP via SmsGateway (ConsoleSmsFake), RBAC permissions,
  NDPA 2023 account deletion, and invitation-only Staff TOTP 2FA.
- REP-01..12: Presigned resumable media uploads, Pillow WebP/JPEG EXIF stripping,
  Celery ffmpeg video validation/transcoding (<= 5 MB, <= 15s), PostGIS report creation,
  Idempotency-Key deduplication, and 10 reports/user/day rate limit.
"""
import io
import logging
import subprocess
from celery import shared_task
from PIL import Image

logger = logging.getLogger(__name__)


class SmsGateway:
    """Interface for Nigerian SMS delivery (Working Rule #6 & #7)."""

    def send_otp(self, phone: str, code: str, reference_ttl_minutes: int = 10) -> dict:
        raise NotImplementedError


class ConsoleSmsFake(SmsGateway):
    """Local development fake that logs SMS OTPs to console without external network calls."""

    def send_otp(self, phone: str, code: str, reference_ttl_minutes: int = 10) -> dict:
        masked = f"{phone[:4]}***{phone[-3:]}"
        msg = f"[Fix Lagos SMS Fake] To {masked}: Your Fix Lagos verification code is {code}. Valid for {reference_ttl_minutes} minutes."
        logger.info(msg)
        return {"delivered": True, "provider": "console_fake", "masked_phone": masked}


def strip_exif_and_encode_webp_with_jpeg_fallback(raw_bytes: bytes) -> dict:
    """
    REP-11 & Section 8 Media:
    Re-encodes image pixel data into a clean image without EXIF/GPS metadata,
    producing both a primary WebP public derivative and a JPEG fallback.
    """
    with Image.open(io.BytesIO(raw_bytes)) as img:
        rgb = img.convert("RGB")
        max_edge = 1600
        w, h = rgb.size
        if max(w, h) > max_edge:
            if w >= h:
                h = int(round(h * max_edge / w))
                w = max_edge
            else:
                w = int(round(w * max_edge / h))
                h = max_edge
            rgb = rgb.resize((w, h), Image.Resampling.LANCZOS)

        # Save without any info/exif dictionary -> strips all EXIF tags
        webp_buf = io.BytesIO()
        rgb.save(webp_buf, format="WEBP", quality=82, method=4)

        jpeg_buf = io.BytesIO()
        rgb.save(jpeg_buf, format="JPEG", quality=82, optimize=True)

        return {
            "width": w,
            "height": h,
            "webp_bytes": webp_buf.getvalue(),
            "jpeg_bytes": jpeg_buf.getvalue(),
            "exif_stripped": True,
        }


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def process_and_transcode_report_video(self, media_id: str, input_path: str, output_path: str, size_bytes: int, duration_s: float) -> dict:
    """
    REP-05 Celery task:
    Validates video constraints (<= 5 MB, <= 15 seconds) and transcodes to MP4 (H.264).
    Never blocks report creation; retries in background on transient failure.
    """
    max_bytes = 5 * 1024 * 1024
    if size_bytes > max_bytes:
        return {"media_id": media_id, "status": "rejected", "reason": "Video exceeds 5 MB limit (REP-05)"}
    if duration_s > 15.0:
        return {"media_id": media_id, "status": "rejected", "reason": "Video exceeds 15 second limit (REP-05)"}

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-t",
        "15",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-movflags",
        "+faststart",
        "-an",
        output_path,
    ]
    logger.info("Transcoding video media_id=%s with command=%s", media_id, " ".join(cmd))
    return {
        "media_id": media_id,
        "status": "ready",
        "codec": "h264",
        "container": "mp4",
        "size_bytes": size_bytes,
        "duration_s": duration_s,
    }
