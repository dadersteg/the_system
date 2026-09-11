import json
import re
import os
import sys
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

# Load environment variables from .env if present
for env_candidate in [
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.env')),
    "/Users/daniel/Developer/the_system/.env"
]:
    if os.path.exists(env_candidate):
        with open(env_candidate, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"\''))
        break

LOG_FILE = os.environ.get("BEEPER_LOG_FILE", "/Users/daniel/.pm2/logs/beeper-bridge-out.log")
BEEPER_API_URL = os.environ.get("BEEPER_API_URL", "http://localhost:23373")
BEEPER_TOKEN = os.environ.get("BEEPER_ACCESS_TOKEN", "")

OUTAGE_START = datetime(2026, 9, 5, 19, 50, 0, tzinfo=timezone.utc)
OUTAGE_END = datetime(2026, 9, 10, 13, 0, 0, tzinfo=timezone.utc)

def get_chat_title_from_api(chat_id):
    try:
        url = f"{BEEPER_API_URL}/v1/chats/{urllib.parse.quote(chat_id)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {BEEPER_TOKEN}"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("title") or chat_id
    except Exception:
        return chat_id

def parse_logs():
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    pattern = re.compile(r"DUMPING MESSAGE EVENT:\s*(\{.*?\n\}(?=\n(?:[0-9]+\|beeper-b|DUMPING|Ignoring|Buffered|\Z)))", re.DOTALL)
    matches = pattern.findall(content)

    missing_messages = []
    seen_ids = set()

    for raw in matches:
        try:
            event = json.loads(raw)
        except Exception:
            continue

        entries = event.get("entries", [])
        if not entries and "text" in event:
            entries = [event]

        for entry in entries:
            msg_id = entry.get("id")
            if msg_id and msg_id in seen_ids:
                continue
            if msg_id:
                seen_ids.add(msg_id)

            ts_str = entry.get("timestamp") or entry.get("ts")
            if not ts_str:
                continue

            try:
                ts_clean = ts_str.replace("Z", "+00:00")
                msg_dt = datetime.fromisoformat(ts_clean)
            except Exception:
                continue

            if OUTAGE_START <= msg_dt <= OUTAGE_END:
                missing_messages.append({
                    "id": msg_id,
                    "accountID": entry.get("accountID", "unknown"),
                    "chatID": entry.get("chatID", ""),
                    "senderName": entry.get("senderName", entry.get("senderID", "Unknown")),
                    "isSender": entry.get("isSender", False),
                    "text": entry.get("text", "[Media/Empty]"),
                    "type": entry.get("type", "TEXT"),
                    "timestamp": msg_dt,
                    "hasAttachments": bool(entry.get("attachments"))
                })

    return missing_messages

def main():
    messages = parse_logs()
    
    # Categorize by network
    by_network = defaultdict(list)
    for m in messages:
        acct = m["accountID"]
        if "instagram" in acct.lower():
            net = "Instagram"
        elif "whatsapp" in acct.lower():
            net = "WhatsApp"
        elif "messenger" in acct.lower() or "facebook" in acct.lower():
            net = "Messenger"
        elif "telegram" in acct.lower():
            net = "Telegram"
        else:
            net = acct or "Other"
        by_network[net].append(m)

    print("=" * 65)
    print("      BEEPER BRIDGE OUTAGE IMPACT ANALYSIS (SEP 5 - SEP 10)")
    print("=" * 65)
    print(f"Total un-forwarded messages intercepted: {len(messages)}")
    print(f"Outage window: Sat 5 Sep 2026, 20:52 BST -> Thu 10 Sep 2026, 13:50 BST (~4 days 17 hours)\n")

    print("BREAKDOWN BY PLATFORM:")
    for net, msgs in sorted(by_network.items(), key=lambda x: -len(x[1])):
        received = sum(1 for m in msgs if not m["isSender"])
        sent = sum(1 for m in msgs if m["isSender"])
        print(f"  • {net:12}: {len(msgs):4} messages ({received} incoming, {sent} sent by you)")

    insta_msgs = by_network.get("Instagram", [])
    print(f"\n" + "=" * 65)
    print(f"  INSTAGRAM DETAIL: {len(insta_msgs)} TOTAL MESSAGES MISSING FROM GMAIL")
    print("=" * 65)

    by_chat = defaultdict(list)
    for m in insta_msgs:
        by_chat[m["chatID"]].append(m)

    chat_titles = {}
    for cid in by_chat.keys():
        chat_titles[cid] = get_chat_title_from_api(cid)

    # Sort chats by total messages descending
    sorted_chats = sorted(by_chat.items(), key=lambda x: -len(x[1]))

    for idx, (chat_id, msgs) in enumerate(sorted_chats, 1):
        title = chat_titles.get(chat_id, chat_id)
        msgs.sort(key=lambda x: x["timestamp"])
        first_ts = msgs[0]["timestamp"].strftime("%d %b %H:%M")
        last_ts = msgs[-1]["timestamp"].strftime("%d %b %H:%M")
        incoming_count = sum(1 for m in msgs if not m["isSender"])
        outgoing_count = sum(1 for m in msgs if m["isSender"])
        participants = set(m["senderName"] for m in msgs)

        print(f"\n{idx}. {title}")
        print(f"   Chat ID: {chat_id}")
        print(f"   Volume : {len(msgs)} messages ({incoming_count} incoming from others, {outgoing_count} sent by you)")
        print(f"   Window : {first_ts} -> {last_ts}")
        print(f"   People : {', '.join(participants)}")
        print("   Recent / key message excerpts:")
        for m in msgs[-6:]:
            clean = re.sub(r'<[^>]+>', ' ', m['text']).strip()
            clean = re.sub(r'\s+', ' ', clean)
            if len(clean) > 85:
                clean = clean[:85] + "..."
            arrow = "→" if m["isSender"] else "←"
            print(f"     [{m['timestamp'].strftime('%d %b %H:%M')}] {arrow} {m['senderName']}: {clean or '[Attachment/Reaction]'}")

if __name__ == "__main__":
    main()

