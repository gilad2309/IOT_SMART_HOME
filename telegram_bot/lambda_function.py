import os
import json
import urllib.request

BOT_TOKEN = os.environ["BOT_TOKEN"]
CHAT_ID = os.environ["CHAT_ID"]
THRESHOLD = int(os.environ.get("PEOPLE_THRESHOLD", "1"))


def send_telegram(msg: str):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": CHAT_ID, "text": msg}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read()


def lambda_handler(event, context):
    for record in event.get("Records", []):
        if record.get("eventName") not in ("INSERT", "MODIFY"):
            continue

        new_image = record.get("dynamodb", {}).get("NewImage", {})
        metric = new_image.get("metric", {}).get("S")
        if metric != "person_count":
            continue

        count_val = new_image.get("count", {}).get("N")
        if count_val is None:
            continue

        count = int(float(count_val))
        if count >= THRESHOLD:
            send_telegram(f"\ud83d\udea8 Person detected: {count}")

    return {"ok": True}
