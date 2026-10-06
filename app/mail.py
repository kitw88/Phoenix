import os
import smtplib
import subprocess
from email.message import EmailMessage


def send_otp(to: str, code: str, locale: str = "") -> None:
    subject, body = _copy(code, locale)
    host = os.environ.get("SMTP_HOST", "").strip()
    if host:
        _smtp(to, subject, body, host)
        return
    _outlook(to, subject, body)


def _copy(code: str, locale: str) -> tuple[str, str]:
    lang = _lang(locale)
    if lang == "hant":
        return (
            "測評桌面 登錄驗證碼",
            f"測評桌面 驗證碼：{code}\n\n10 分鐘內有效。此碼只用於登錄測評桌面。",
        )
    if lang == "hans":
        return (
            "测评桌面 登录验证码",
            f"测评桌面 验证码：{code}\n\n10 分钟内有效。此码只用于登录测评桌面。",
        )
    return (
        "Prompt Desk sign-in code",
        f"Prompt Desk code: {code}\n\nThis code expires in 10 minutes. It is only for signing in to Prompt Desk.",
    )


def _lang(locale: str) -> str:
    value = (locale or "").lower().replace("_", "-")
    if not value or value.startswith("en"):
        return "en"
    if "hant" in value or value.startswith(("zh-tw", "zh-hk", "zh-mo")):
        return "hant"
    if value.startswith("zh"):
        return "hans"
    return "en"


def _smtp(to: str, subject: str, body: str, host: str) -> None:
    port = int(os.environ.get("SMTP_PORT", "587"))
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USER", "").strip()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to
    message.set_content(body)
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        user = os.environ.get("SMTP_USER", "").strip()
        password = os.environ.get("SMTP_PASSWORD", "")
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def _outlook(to: str, subject: str, body: str) -> None:
    script = r"""
$ErrorActionPreference = 'Stop'
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = $env:PHOENIX_OTP_TO
$mail.Subject = $env:PHOENIX_OTP_SUBJECT
$mail.Body = $env:PHOENIX_OTP_BODY
$mail.Send()
"""
    env = os.environ.copy()
    env["PHOENIX_OTP_TO"] = to
    env["PHOENIX_OTP_SUBJECT"] = subject
    env["PHOENIX_OTP_BODY"] = body
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        env=env,
        capture_output=True,
        text=True,
        timeout=40,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "Outlook did not send the code").strip()
        raise RuntimeError(detail[-240:])
