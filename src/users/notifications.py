# src/users/notifications.py
from typing import Optional
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from datetime import date
from urllib.parse import quote

def notify_user_account_action(
    *,
    email: str,
    full_name: str,
    action: str,                  # "suspended" | "unsuspended" | "deleted"
    reason: Optional[str] = None,
    actor_email: Optional[str] = None,
) -> int:
    if not email:
        return 0

    app_name     = getattr(settings, "APP_NAME", "Insider Threat Detection")
    brand_color  = getattr(settings, "BRAND_COLOR", "#2563EB")
    support_mail = getattr(settings, "SUPPORT_EMAIL", getattr(settings, "DEFAULT_FROM_EMAIL", "support@example.com"))
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

    # Subject (same as other mails) + anti-threading timestamp (testing only)
    base_subject = {
        "suspended":   f"[{app_name}] Account suspended",
        "unsuspended": f"[{app_name}] Account reactivated",
        "deleted":     f"[{app_name}] Account deleted",
    }.get(action, f"[{app_name}] Account update")
    subject = f"{base_subject} • {timezone.now():%H:%M:%S}"  # <— add while testing

    # Plain text fallback
    text = "\n".join([
        f"Hello {full_name or 'there'},",
        "",
        f"Your {app_name} account has been {action}.",
        *( [f"Reason: {reason}"] if reason else [] ),
        *( [f"Performed by: {actor_email}"] if actor_email else [] ),
        "",
        f"If you need help, contact {support_mail}.",
    ])

    # HTML (single-column card)
    cta_text, cta_url = (
        ("Sign in", f"{frontend_url}/login")
        if action == "unsuspended"
        else ("Contact support", f"mailto:{support_mail}?subject={quote(f'{app_name} account {action}')}")
    )
    status_color = {"suspended": "#DC2626", "unsuspended": "#16A34A", "deleted": "#6B7280"}.get(action, "#6B7280")

    html = f"""\
<!doctype html><html><body style="margin:0;padding:0;background:#F5F7FB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FB;padding:32px 0;">
<tr><td>
  <table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0"
         style="width:640px;max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);border-top:6px solid {brand_color};">
    <tr><td style="padding:28px 32px 12px;text-align:center;">
      <div style="font-size:20px;font-weight:700;color:#0F172A;letter-spacing:.2px;">{app_name}</div>
    </td></tr>
    <tr><td style="padding:0 32px 4px;text-align:center;">
      <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#EDF2F7;color:{status_color};font-size:12px;font-weight:600;">
        {action.capitalize()}
      </div>
    </td></tr>
    <tr><td style="padding:8px 32px 0;text-align:center;">
      <h1 style="margin:12px 0 8px;font-size:24px;line-height:1.25;color:#111827;font-weight:800;">Account {action.capitalize()}</h1>
    </td></tr>
    <tr><td style="padding:0 32px 8px;text-align:center;">
      <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">Hello {full_name or 'there'}, your account has been <strong>{action}</strong>.</p>
    </td></tr>
    {f"<tr><td style='padding:4px 32px 0;text-align:center;'><p style='margin:0;font-size:14px;line-height:1.6;color:#4B5563;'><strong>Reason:</strong> {reason}</p></td></tr>" if reason else ""}
    {f"<tr><td style='padding:4px 32px 0;text-align:center;'><p style='margin:0;font-size:14px;line-height:1.6;color:#4B5563;'><strong>Performed by:</strong> {actor_email}</p></td></tr>" if actor_email else ""}
    <tr><td style="padding:20px 32px 8px;text-align:center;">
      <a href="{cta_url}" style="display:inline-block;background:{brand_color};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">
        {cta_text}
      </a>
    </td></tr>
    <tr><td style="padding:8px 32px 24px;text-align:center;">
      <p style="margin:8px 0 0;font-size:13px;color:#6B7280;">
        If you believe this is a mistake, reply to this email or reach us at
        <a href="mailto:{support_mail}" style="color:{brand_color};text-decoration:none;">{support_mail}</a>.
      </p>
    </td></tr>
  </table>
  <table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;margin:12px auto 0;">
    <tr><td style="text-align:center;color:#94A3B8;font-size:12px;padding:8px;">
      © {date.today().year} {app_name} · Need help?
      <a href="mailto:{support_mail}" style="color:{brand_color};text-decoration:none;">{support_mail}</a>
      <!-- HTML_PRESENT_MARKER -->
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""

    return send_mail(
        subject=subject,
        message=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
        html_message=html,
    )
