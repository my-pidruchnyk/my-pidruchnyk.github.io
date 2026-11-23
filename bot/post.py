#!/usr/bin/env python3
"""Щоденний пост бота «Школярик» у канал (і, за бажання, у чат) про сайт «Підручники 8 клас».

Логіка — без стану, усе виводиться з дати запуску:
  * перші N днів від guide_start (bot/config.json) — гайд: bot/guide/01.html, 02.html, …
    (якщо за добу були оновлення сайту — коротко згадуються внизу поста гайду);
  * далі — пост «Оновлення сайту» з аналізом комітів за останню добу
    (якщо комітів не було — пост не виходить).
Доба = 24 год до останнього «часу посту» (post_hour_utc), тож запуск із запізненням нічого не губить.

Запуск:
  python bot/post.py                 # звичайний щоденний запуск (GitHub Actions)
  python bot/post.py --dry-run       # лише показати, що буде опубліковано
  python bot/post.py --day 3         # примусово пост гайду № 3
  python bot/post.py --updates       # примусово пост про оновлення
  python bot/post.py --since 7d      # вікно комітів (для перевірки): 7d, 48h …
  python bot/post.py --chat-id …     # надіслати в інший чат (тест)
Токен: змінна середовища TELEGRAM_BOT_TOKEN або --token-file <файл>.
Лише стандартна бібліотека Python — нічого встановлювати не треба.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parent
REPO = BOT_DIR.parent
CONFIG = json.loads((BOT_DIR / "config.json").read_text(encoding="utf-8"))
GUIDE = sorted((BOT_DIR / "guide").glob("*.html"))

MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня",
          "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"]

# які частини сайту зачепив коміт — за шляхами файлів (порядок важливий: перше збігання)
AREAS = [
    (r"^assets/themes\.", "🎨 Теми оформлення"),
    (r"^assets/motion\.", "🎬 Анімації"),
    (r"^assets/quiz\.js", "⚡ Тести й банк помилок"),
    (r"^assets/auth\.js", "👩‍🏫 Вхід для вчителя"),
    (r"^assets/pdf-export\.js", "📄 Експорт у PDF"),
    (r"^assets/app\.(js|css)", "📖 Головна й читалка"),
    (r"^books/[^/]+/theses\.json", "📝 Тези підручників"),
    (r"^books/", "📚 Підручники"),
    (r"^books\.json", "📚 Список підручників"),
    (r"^index\.html", "🌐 Сторінка сайту"),
]
# службові файли — коміти лише з ними в пост не потрапляють
META = re.compile(r"^(bot/|\.github/|README\.md$|\.nojekyll$|\.gitignore$)")
FIX_WORDS = re.compile(r"\b(fix|виправ|помилк|баг)", re.I)
# технічні подробиці комітів, незрозумілі учням (файли, змінні, API браузера)
TECH = re.compile(r"[\w-]+\.(js|css|html|json|py)\b|localStorage|@media|window\.|html\.m-|Element\.|"
                  r"View Transitions|\bp8:|prefers-reduced|z-index|\bvh\b|\d+px")


# ---------------------------------------------------------------- час і вікно комітів
def last_post_boundary(now: dt.datetime) -> dt.datetime:
    b = now.replace(hour=int(CONFIG["post_hour_utc"]), minute=0, second=0, microsecond=0)
    return b if now >= b else b - dt.timedelta(days=1)


def parse_span(s: str) -> dt.timedelta:
    m = re.fullmatch(r"(\d+)([dh])", s.strip())
    if not m:
        raise SystemExit(f"--since: очікую формат 7d або 48h, отримав {s!r}")
    n = int(m.group(1))
    return dt.timedelta(days=n) if m.group(2) == "d" else dt.timedelta(hours=n)


def plural(n: int, one: str, few: str, many: str) -> str:
    """1 файл, 2 файли, 5 файлів."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} {one}"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} {few}"
    return f"{n} {many}"


def ua_date(d: dt.date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


# ---------------------------------------------------------------- коміти
def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True,
                          text=True, encoding="utf-8").stdout


def commits_between(start: dt.datetime, end: dt.datetime) -> list[dict]:
    raw = git("log", "--no-merges", f"--since={start.isoformat()}", f"--until={end.isoformat()}",
              "--format=%H%x1f%s%x1f%b%x1e")
    out = []
    for rec in raw.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        sha, subject, body = (rec.split("\x1f") + ["", ""])[:3]
        files, added, removed = [], 0, 0
        for line in git("show", "--numstat", "--format=", sha).splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            a, r, path = parts
            files.append(path)
            added += int(a) if a.isdigit() else 0
            removed += int(r) if r.isdigit() else 0
        if not files or all(META.match(f) for f in files):
            continue  # лише службові зміни (бот, README…) — не новина для читачів
        out.append({"sha": sha, "subject": subject.strip(), "body": body, "files": files,
                    "added": added, "removed": removed})
    out.reverse()  # від старших до новіших
    return out


REVERT = re.compile(r'^Revert "(.*)"$')


def split_version(subject: str) -> tuple[str, str | None]:
    """«Назва (v14.9)» → («Назва», «v14.9»); відкат «Revert "Назва (v15.0)"» → («Скасовано: Назва», None)."""
    if (rv := REVERT.match(subject.strip())):
        return "Скасовано: " + split_version(rv.group(1))[0], None
    m = re.search(r"\s*\((v\d+(?:\.\d+)*)\)\s*$", subject)
    return (subject[:m.start()], m.group(1)) if m else (subject, None)


def bullets(body: str, limit: int = 5) -> list[str]:
    items = []
    for line in body.splitlines():
        line = line.strip()
        if re.match(r"^(co-authored-by|signed-off-by):", line, re.I):
            continue
        if line.startswith(("- ", "* ", "• ")):
            items.append(line[2:].strip())
        elif items and line and not line.endswith(":") and not re.match(r"^[A-ZА-ЯІЇЄҐ]", line):
            items[-1] += " " + line  # перенесений рядок попереднього пункту
    return items[:limit]


def humanize(text: str) -> str:
    """Прибрати з пункту коміту технічні фрагменти, лишивши зрозуміле:
    «Новий шар motion.css: поява карток…» → «Поява карток…»."""
    text = re.sub(r"\s*\([^)]*\)", lambda m: "" if TECH.search(m.group()) else m.group(), text)
    text = re.sub(r"(?<!\.)\.\.(?!\.)", ".", text)  # «Вимк. (…)» → «Вимк..» → «Вимк.»
    keep = []
    for part in re.split(r"(?<=[;.])\s+(?=\S)", text):
        if TECH.search(part):
            _, sep, tail = part.partition(":")
            if sep and tail.strip() and not TECH.search(tail):
                part = tail.strip()
                part = part[:1].upper() + part[1:]
            else:
                continue
        keep.append(part)
    return " ".join(keep).strip().rstrip(";,").strip()


def areas_of(files: list[str]) -> list[str]:
    found = []
    for f in files:
        for pat, name in AREAS:
            if re.match(pat, f):
                if name not in found:
                    found.append(name)
                break
    return found


# ---------------------------------------------------------------- тексти постів
def updates_post(commits: list[dict], day: dt.date) -> str:
    e = html.escape
    # версія — та, що реально опублікована (index.html в останньому коміті), а не з назв комітів:
    # після відкату назва старого коміту ще містить «(v15.0)», а на сайті вже попередня версія
    try:
        live = re.search(r"\?v=(\d+(?:\.\d+)*)", git("show", "HEAD:index.html"))
        versions = [f"v{live.group(1)}"] if live else []
    except subprocess.CalledProcessError:
        versions = [v for c in commits if (v := split_version(c["subject"])[1])]
    fixes = sum(1 for c in commits if FIX_WORDS.search(c["subject"]))
    lines = [f"🛠 <b>Оновлення сайту · {ua_date(day)}</b>"]
    if versions:
        lines.append(f"🏷 Версія сайту: <b>{e(versions[-1])}</b>")
    lines += ["", "<b>Що нового:</b>"]
    for c in commits[::-1][:8]:  # найновіші — першими
        title, _ = split_version(c["subject"])
        icon = "↩️" if REVERT.match(c["subject"]) else "🐞" if FIX_WORDS.search(c["subject"]) else "✨"
        lines.append(f"{icon} <b>{e(title)}</b>")
        for b in bullets(c["body"]):
            if (b := humanize(b)):
                lines.append(f"   • {e(b)}")
    if len(commits) > 8:
        lines.append(f"…і ще {plural(len(commits) - 8, 'зміна', 'зміни', 'змін')} раніше.")

    areas, files = [], set()
    for c in commits:
        files.update(c["files"])
        for a in areas_of(c["files"]):
            if a not in areas:
                areas.append(a)
    added = sum(c["added"] for c in commits)
    removed = sum(c["removed"] for c in commits)
    lines += ["", "📊 <b>Коротко про оновлення</b>"]
    if areas:
        lines.append("Зачеплено: " + ", ".join(areas))
    news = len(commits) - fixes
    kind = ", ".join(x for x in (
        plural(news, "нововведення", "нововведення", "нововведень") if news else "",
        plural(fixes, "виправлення", "виправлення", "виправлень") if fixes else "",
    ) if x)
    lines.append(f"{kind} · {plural(len(files), 'файл', 'файли', 'файлів')} · +{added} / −{removed} рядків")
    lines += ["", "🔄 Не бачиш змін? Натисни <b>Ctrl + F5</b> (на телефоні — онови сторінку)."]
    return "\n".join(lines)


def updates_footer(commits: list[dict]) -> str:
    e = html.escape
    titles = [split_version(c["subject"])[0] for c in commits[::-1][:3]]
    tail = f" (і ще {len(commits) - 3})" if len(commits) > 3 else ""
    return ("\n\n🛠 <b>А ще за добу на сайті:</b>\n"
            + "\n".join(f"• {e(t)}" for t in titles) + tail)


# ---------------------------------------------------------------- Telegram
def tg(token: str, method: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        data = json.loads(err.read().decode("utf-8") or "{}")
    if not data.get("ok"):
        raise SystemExit(f"Telegram {method}: помилка — {data.get('description', data)}")
    return data["result"]


def buttons() -> dict:
    row = [{"text": "🌐 Відкрити сайт", "url": CONFIG["site_url"]}]
    if CONFIG.get("chat_url"):
        row.append({"text": "💬 Чат", "url": CONFIG["chat_url"]})
    return {"inline_keyboard": [row]}


def read_token(token_file: str | None) -> str:
    if token_file:
        return Path(token_file).read_text(encoding="utf-8").strip()
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not tok:
        raise SystemExit("Немає токена: задайте TELEGRAM_BOT_TOKEN або --token-file.")
    return tok


# ---------------------------------------------------------------- головне
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="лише показати пост, нічого не надсилати")
    ap.add_argument("--day", type=int, help="примусово пост гайду № N (1…)")
    ap.add_argument("--updates", action="store_true", help="примусово пост про оновлення")
    ap.add_argument("--since", help="вікно комітів замість доби: 7d, 48h …")
    ap.add_argument("--chat-id", help="куди надіслати замість каналу з config.json (тест)")
    ap.add_argument("--token-file", help="файл із токеном замість TELEGRAM_BOT_TOKEN")
    a = ap.parse_args()

    now = dt.datetime.now(dt.timezone.utc)
    end = last_post_boundary(now)
    start = end - (parse_span(a.since) if a.since else dt.timedelta(days=1))
    commits = commits_between(start, end if not a.since else now)

    guide_day = (end.date() - dt.date.fromisoformat(CONFIG["guide_start"])).days + 1
    if a.day:
        guide_day = a.day
    if a.updates:
        guide_day = 0

    if guide_day < 1 and not a.updates:
        print(f"[{now:%Y-%m-%d %H:%M} UTC] Гайд ще не почався — перший пост {CONFIG['guide_start']}.")
        return
    if 1 <= guide_day <= len(GUIDE):
        text = GUIDE[guide_day - 1].read_text(encoding="utf-8").strip()
        if commits:
            text += updates_footer(commits)
        kind = f"гайд, день {guide_day} з {len(GUIDE)}"
    elif commits:
        text = updates_post(commits, end.date())
        kind = f"оновлення: {plural(len(commits), 'коміт', 'коміти', 'комітів')}"
    else:
        print(f"[{now:%Y-%m-%d %H:%M} UTC] Гайд завершено, а за добу оновлень не було — пост не виходить.")
        return

    if len(text) > 4096:
        raise SystemExit(f"Пост задовгий для Telegram: {len(text)} символів (максимум 4096).")
    print(f"=== {kind} · {len(text)} символів · коміти з {start:%Y-%m-%d %H:%M} до {end:%Y-%m-%d %H:%M} UTC ===")
    print(text)
    if a.dry_run:
        print("=== dry-run: нічого не надіслано ===")
        return

    token = read_token(a.token_file)
    target = a.chat_id or CONFIG["channel"]
    msg = tg(token, "sendMessage", {
        "chat_id": target, "text": text, "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True}, "reply_markup": buttons(),
    })
    print(f"Опубліковано в {target} (message_id {msg['message_id']}).")
    group = CONFIG.get("group_chat_id")
    if group and not a.chat_id:
        tg(token, "forwardMessage", {"chat_id": group, "from_chat_id": msg["chat"]["id"],
                                     "message_id": msg["message_id"]})
        print(f"Переслано в чат {group}.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
