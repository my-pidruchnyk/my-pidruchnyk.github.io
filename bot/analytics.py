#!/usr/bin/env python3
"""Щоденний звіт аналітики сайту від бота «Школярик» — ЛИШЕ власнику, у приватні повідомлення.

Цифри — з GoatCounter API (лічильник assets/stats.js на сайті; без cookie, анонімно):
  відвідувачі за вчора (+ порівняння з позавчора), за 7 днів, популярні предмети, пройдені тести,
  країни, системи (Android / Windows / iOS…).

Секрети (GitHub → Settings → Secrets and variables → Actions):
  GOATCOUNTER_TOKEN   — API-ключ GoatCounter (кабінет → ваше ім'я вгорі → API);
  TELEGRAM_OWNER_ID   — ваш Telegram ID (звіт іде лише туди, ніколи не в канал/чат);
  TELEGRAM_BOT_TOKEN  — токен бота (вже є).
Код сайту в GoatCounter — bot/config.json → "goatcounter_code".
Немає ключа чи коду — тихо пропускає (щоб щоденний запуск не «падав»).

Запуск:  python bot/analytics.py [--dry-run] [--sample]
  --sample — показати, як виглядатиме звіт, на вигаданих даних (без мережі).
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parent
CONFIG = json.loads((BOT_DIR / "config.json").read_text(encoding="utf-8"))
MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня",
          "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"]


def plural(n: int, one: str, few: str, many: str) -> str:
    a, b = n % 10, n % 100
    return f"{n} {one if a == 1 and b != 11 else few if 2 <= a <= 4 and not 12 <= b <= 14 else many}"


# ---------------------------------------------------------------- GoatCounter API
class GC:
    def __init__(self, code: str, token: str):
        self.base = f"https://{code}.goatcounter.com/api/v0"
        self.token = token

    def get(self, path: str, **params) -> dict:
        q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        req = urllib.request.Request(f"{self.base}{path}?{q}", headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        time.sleep(0.3)                                    # ліміт GoatCounter — 4 запити/с
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            raise SystemExit(f"GoatCounter {path}: HTTP {e.code} — {body}")


def iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def collect(gc: GC, day: dt.date) -> dict:
    """Дані за добу `day` (UTC) + порівняння."""
    d0 = dt.datetime.combine(day, dt.time(0), dt.timezone.utc)
    rng = lambda a, b: {"start": iso(a), "end": iso(b)}
    y = gc.get("/stats/total", **rng(d0, d0 + dt.timedelta(days=1)))
    prev = gc.get("/stats/total", **rng(d0 - dt.timedelta(days=1), d0))
    week = gc.get("/stats/total", **rng(d0 - dt.timedelta(days=6), d0 + dt.timedelta(days=1)))
    hits = gc.get("/stats/hits", limit=100, **rng(d0, d0 + dt.timedelta(days=1)))
    loc = gc.get("/stats/locations", limit=5, **rng(d0, d0 + dt.timedelta(days=1)))
    sysm = gc.get("/stats/systems", limit=5, **rng(d0, d0 + dt.timedelta(days=1)))
    return {
        "day": day,
        "visitors": y.get("total", 0) - y.get("total_events", 0),
        "prev": prev.get("total", 0) - prev.get("total_events", 0),
        "week": week.get("total", 0) - week.get("total_events", 0),
        "pages": [(h.get("title") or h.get("path"), h.get("count", 0), h.get("path", ""))
                  for h in hits.get("hits", []) if not h.get("event")],
        "events": [(h.get("title") or h.get("path"), h.get("count", 0), h.get("path", ""))
                   for h in hits.get("hits", []) if h.get("event")],
        "locations": [(s.get("name") or "?", s.get("count", 0)) for s in loc.get("stats", [])],
        "systems": [(s.get("name") or "?", s.get("count", 0)) for s in sysm.get("stats", [])],
    }


def sample() -> dict:
    return {"day": dt.date.today() - dt.timedelta(days=1), "visitors": 37, "prev": 33, "week": 210,
            "pages": [("Головна", 35, "/"), ("Біологія", 12, "/biolohiia"), ("Алгебра", 9, "/algebra"),
                      ("Фізика", 7, "/fizyka"), ("Історія України", 5, "/istoriia-ukr"), ("Хімія", 3, "/khimiia")],
            "events": [("Тест: Алгебра", 4, "тест/algebra"), ("Тест: Біологія", 3, "тест/biolohiia"),
                       ("Тест: Фізика", 2, "тест/fizyka")],
            "locations": [("Ukraine", 30), ("Poland", 4), ("Germany", 2)],
            "systems": [("Android", 20), ("Windows", 12), ("iOS", 5)]}


# ---------------------------------------------------------------- текст звіту
def report(d: dict) -> str:
    e = html.escape
    day = d["day"]
    v, p = d["visitors"], d["prev"]
    if p:
        ch = round((v - p) / p * 100)
        trend = f" ({'+' if ch >= 0 else ''}{ch}% до позавчора)"
    else:
        trend = ""
    lines = [f"📊 <b>Аналітика сайту · {day.day} {MONTHS[day.month - 1]}</b>", "",
             f"👥 Відвідувачів: <b>{v}</b>{trend}",
             f"📅 За 7 днів: <b>{d['week']}</b>"]

    books = [(t, c) for t, c, path in d["pages"] if path not in ("/", "")]
    if books:
        lines += ["", "📚 <b>Популярні предмети</b>"]
        lines += [f"{i}. {e(t)} — {c}" for i, (t, c) in enumerate(books[:5], 1)]
    tests = [(t.replace("Тест: ", ""), c) for t, c, _ in d["events"] if str(_).startswith("тест/")]
    if tests:
        total = sum(c for _, c in tests)
        lines += ["", f"⚡ <b>Тести: {total}</b> — " + ", ".join(f"{e(t)} {c}" for t, c in tests[:5])]
    if d["locations"]:
        lines += ["", "🌍 " + ", ".join(f"{e(n)} {c}" for n, c in d["locations"][:4])]
    if d["systems"]:
        lines += ["📱 " + ", ".join(f"{e(n)} {c}" for n, c in d["systems"][:4])]
    if not v:
        lines += ["", "Вчора на сайт ніхто не заходив 🙁"]
    return "\n".join(lines)


def send(token: str, chat: str, text: str, code: str) -> None:
    payload = {"chat_id": chat, "text": text, "parse_mode": "HTML", "link_preview_options": {"is_disabled": True},
               "reply_markup": {"inline_keyboard": [[{"text": "📈 Відкрити GoatCounter", "url": f"https://{code}.goatcounter.com"}]]}}
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage",
                                 data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        d = json.loads(err.read().decode("utf-8") or "{}")
    if not d.get("ok"):
        raise SystemExit(f"Telegram: {d.get('description', d)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="показати звіт, не надсилати")
    ap.add_argument("--sample", action="store_true", help="звіт на вигаданих даних (без мережі)")
    a = ap.parse_args()

    if a.sample:
        print(report(sample()))
        return
    code = CONFIG.get("goatcounter_code") or ""
    gc_token = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    owner = os.environ.get("TELEGRAM_OWNER_ID", "").strip()
    if not code or not gc_token or not owner:
        print("Аналітика не налаштована (немає goatcounter_code, GOATCOUNTER_TOKEN або TELEGRAM_OWNER_ID) — пропускаю.")
        return
    data = collect(GC(code, gc_token), (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).date())
    text = report(data)
    if a.dry_run:
        print(text)
        return
    send(os.environ["TELEGRAM_BOT_TOKEN"], owner, text, code)
    print("Звіт надіслано власнику.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
