"""OVspot Android-feedback: reuse the existing admin app_ideas SQLite inbox.

Bot credentials are read exclusively server-side from the already configured
OVspot watchdog Telegram config. Nothing credential-related is exposed to apps.
"""
from __future__ import annotations

import hmac
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

from flask import jsonify, request

CATEGORIES = {"kaart_data", "idee", "bug", "overig"}
CONTACT_RE = re.compile(r"^[^\s@<>]{1,80}@[^\s@<>]{1,100}\.[^\s@<>]{2,20}$")
BOT_CONFIG = Path("/home/ubuntu/kv15-bot/alert_config.sh")


def _text(value, limit):
    if not isinstance(value, str):
        return ""
    return re.sub(r"[\x00-\x1f\x7f]", "", value).strip()[:limit]


def _telegram_config():
    """Parse only two shell-style simple assignments; never execute or log secrets."""
    try:
        raw = BOT_CONFIG.read_text(encoding="utf-8")
    except OSError:
        return None
    values = {}
    for line in raw.splitlines():
        match = re.fullmatch(
            r"\s*(?:export\s+)?(TELEGRAM_TOKEN|TELEGRAM_CHAT_ID)\s*=\s*(.*?)\s*",
            line,
        )
        if match:
            values[match[1]] = match[2].strip().strip('"\'')
    token, chat = values.get("TELEGRAM_TOKEN", ""), values.get("TELEGRAM_CHAT_ID", "")
    if not re.fullmatch(r"\d{6,15}:[A-Za-z0-9_-]{20,70}", token):
        return None
    if not re.fullmatch(r"-?\d{4,30}", chat):
        return None
    return token, chat


def _send_telegram(ident, category, message, email, metadata):
    creds = _telegram_config()
    if not creds:
        return False
    token, chat_id = creds
    ctx = metadata.get("context", {})
    context_text = ", ".join(
        str(ctx[k]) for k in ("view", "stop_id", "stop_name", "rit_id", "rit_datum")
        if ctx.get(k)
    )
    text = "\n".join([
        "OVspot app · Nieuwe feedback",
        f"ID: {ident} | Categorie: {category}",
        f"App: {metadata['app_version']} | OTA: {metadata.get('ota_version') or 'onbekend'}",
        f"OS: {metadata['os_version']}",
        f"Scherm: {context_text or 'niet bekend'}",
        f"E-mail: {email or '(niet opgegeven)'}",
        "",
        message,
    ])[:3900]
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        "https://api.telegram.org/bot" + token + "/sendMessage",
        data=payload, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read(1024))
            return response.status == 200 and data.get("ok") is True
    except Exception as exc:
        # Never log the URL/exception string: it can contain the bot token.
        print(f"[OVspot app feedback] Telegram notification failed: {type(exc).__name__}", flush=True)
        return False


def register_app_feedback_v2(app, base_dir):
    """Separate mobile endpoint, shared existing OVbord/admin app_ideas database."""
    db_path = Path(base_dir) / "app_ideas.db"
    rate = {}
    rate_lock = threading.Lock()

    def connect():
        conn = sqlite3.connect(str(db_path), timeout=6)
        conn.execute("PRAGMA busy_timeout=6000")
        return conn

    # Additive, backwards-compatible metadata column in the existing admin DB.
    with connect() as conn:
        fields = {r[1] for r in conn.execute("PRAGMA table_info(app_ideas)")}
        if "feedback_context" not in fields:
            conn.execute("ALTER TABLE app_ideas ADD COLUMN feedback_context TEXT NOT NULL DEFAULT ''")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_ovspot_app_feedback_client "
            "ON app_ideas(source,client_id) "
            "WHERE source='ovspot-app' AND client_id!=''"
        )

    def reply(code, **data):
        resp = jsonify(ok=(code < 400), **data)
        resp.status_code = code
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    @app.post("/api/v2/feedback")
    def ovspot_app_feedback_v2_submit():
        if request.content_length and request.content_length > 8000:
            return reply(413, fout="Bericht is te groot.")
        # Same-origin browser or native client. No cross-origin browser bypass.
        for header in ("Origin", "Referer"):
            if request.headers.get(header):
                from urllib.parse import urlsplit
                u = urlsplit(request.headers[header])
                if u.scheme != "https" or u.hostname not in ("ovspot.nl", "www.ovspot.nl"):
                    return reply(403, fout="Ongeldige herkomst.")
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return reply(400, fout="Ongeldige JSON.")
        allowed = {
            "client_id", "category", "message", "contact", "app_version", "ota_version",
            "os_version", "context", "reported_at"
        }
        if set(data) - allowed:
            return reply(400, fout="Onbekende velden.")
        ident = _text(data.get("client_id"), 80)
        category = _text(data.get("category"), 30).lower()
        message = _text(data.get("message"), 2200)
        contact = _text(data.get("contact"), 200)
        version = _text(data.get("app_version"), 40)
        ota = _text(data.get("ota_version"), 90)
        os_version = _text(data.get("os_version"), 80)
        reported_at = _text(data.get("reported_at"), 40)
        raw_context = data.get("context") or {}
        if not isinstance(raw_context, dict):
            return reply(400, fout="Ongeldige schermcontext.")
        context = {k: _text(raw_context.get(k), limit) for k, limit in {
            "view": 30, "stop_id": 140, "stop_name": 180, "rit_id": 140, "rit_datum": 20
        }.items()}
        if context["view"] not in ("instellingen", "halte", "rit", ""):
            return reply(400, fout="Ongeldige schermcontext.")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", ident):
            return reply(400, fout="Onjuist bericht-ID.")
        if category not in CATEGORIES:
            return reply(400, fout="Kies een categorie.")
        if not 10 <= len(message) <= 2000:
            return reply(400, fout="Gebruik 10 tot 2000 tekens.")
        if contact and not CONTACT_RE.fullmatch(contact):
            return reply(400, fout="Ongeldig e-mailadres.")
        if not version or not os_version:
            return reply(400, fout="Appgegevens ontbreken.")
        try:
            when = datetime.fromisoformat(reported_at.replace("Z", "+00:00"))
            if when.tzinfo is None:
                raise ValueError()
        except (ValueError, TypeError):
            return reply(400, fout="Ongeldig tijdstip.")

        now = int(time.time())
        with connect() as conn:
            existing = conn.execute(
                "SELECT id FROM app_ideas WHERE source='ovspot-app' AND client_id=?", (ident,)
            ).fetchone()
            if existing:
                return reply(201, received=True, id=existing[0], stored=True, telegram="duplicate")

            ip = (request.headers.get("X-Real-IP") or request.remote_addr or "unknown").split(",", 1)[0]
            key = hmac.new(str(app.secret_key or "ovspot").encode(), ip.encode(), hashlib.sha256).hexdigest()
            with rate_lock:
                rate[key] = [x for x in rate.get(key, []) if x > now - 3600]
                if len(rate[key]) >= 10:
                    return reply(429, fout="Te veel berichten; probeer later opnieuw.")
                rate[key].append(now)

            meta = {
                "app_version": version, "ota_version": ota, "os_version": os_version,
                "context": {k: v for k, v in context.items() if v},
                "reported_at": reported_at,
            }
            cur = conn.execute(
                "INSERT INTO app_ideas (created_at,category,message,contact,status,notes,"
                "updated_at,ip_digest,source,client_id,app_version,device_model,rating,"
                "stop_id,stop_name,reported_at,feedback_context)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (now, category, message, contact, "nieuw", "", now, "",
                 "ovspot-app", ident, version, os_version, "",
                 context["stop_id"], context["stop_name"], reported_at,
                 json.dumps(meta, ensure_ascii=False, separators=(",", ":"))),
            )
            idea_id = cur.lastrowid

        # Database commit precedes notification. Telegram failure cannot lose feedback.
        telegram = _send_telegram(idea_id, category, message, contact, meta)
        return reply(201, received=True, stored=True, id=idea_id, telegram=telegram)
