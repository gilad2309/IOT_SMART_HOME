import json
import os

import boto3

ALLOWED_CHAT_ID = os.environ["ALLOWED_CHAT_ID"]
IOT_ENDPOINT = os.environ["IOT_ENDPOINT"]
COMMAND_TOPIC = os.environ.get("COMMAND_TOPIC", "devices/Jetson/commands")

iot = boto3.client("iot-data", endpoint_url=f"https://{IOT_ENDPOINT}")


def lambda_handler(event, context):
    try:
        body = event.get("body", "{}")
        if event.get("isBase64Encoded"):
            import base64

            body = base64.b64decode(body).decode("utf-8")
        payload = json.loads(body)
    except Exception:
        return {"statusCode": 400, "body": "bad request"}

    message = payload.get("message") or payload.get("edited_message")
    if not message:
        return {"statusCode": 200, "body": "no message"}

    chat_id = str(message.get("chat", {}).get("id"))
    text = (message.get("text") or "").strip().lower()
    if text.startswith("/"):
        text = text[1:]

    if chat_id != str(ALLOWED_CHAT_ID):
        return {"statusCode": 403, "body": "unauthorized"}

    allowed = {"run", "run -db", "start pipeline", "stop"}
    if text not in allowed:
        return {"statusCode": 200, "body": "ignored"}

    cmd_payload = json.dumps({"command": text, "source": "telegram"})
    iot.publish(topic=COMMAND_TOPIC, qos=0, payload=cmd_payload)

    return {"statusCode": 200, "body": "ok"}
