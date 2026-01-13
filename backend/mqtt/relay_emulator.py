"""
Fake relay actuator: subscribes to relay commands and logs state changes.
"""

import json
import os
import time

import paho.mqtt.client as mqtt

MQTT_URL = os.getenv("MQTT_URL", "mqtt://mqtt-dashboard.com:1883")
RELAY_COMMAND_TOPIC = os.getenv("RELAY_COMMAND_TOPIC", "actuator/relay")
RELAY_STATUS_TOPIC = os.getenv("RELAY_STATUS_TOPIC", "actuator/relay_status")

relay_state = "off"


def parse_mqtt_url(url: str) -> tuple[str, int]:
    if "://" in url:
        _, rest = url.split("://", 1)
    else:
        rest = url
    if "/" in rest:
        rest = rest.split("/", 1)[0]
    if ":" in rest:
        host, port = rest.split(":", 1)
        return host, int(port)
    return rest, 1883


def normalize_state(value):
    if isinstance(value, bool):
        return "on" if value else "off"
    if isinstance(value, (int, float)):
        return "on" if value > 0 else "off"
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("on", "1", "true"):
            return "on"
        if v in ("off", "0", "false"):
            return "off"
    return None


def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[relay-emulator] connected {MQTT_URL}")
    client.subscribe(RELAY_COMMAND_TOPIC)


def on_message(client, userdata, msg):
    global relay_state
    if msg.topic != RELAY_COMMAND_TOPIC:
        return
    try:
        data = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        data = {"state": msg.payload.decode("utf-8")}
    next_state = normalize_state(data.get("state", data.get("value")))
    if not next_state or next_state == relay_state:
        return
    relay_state = next_state
    payload = json.dumps({"type": "relay", "state": relay_state, "ts": int(time.time() * 1000)})
    print(f"[relay-emulator] state={relay_state}")
    client.publish(RELAY_STATUS_TOPIC, payload, qos=0, retain=False)


def main():
    host, port = parse_mqtt_url(MQTT_URL)
    client = mqtt.Client(client_id=os.getenv("MQTT_CLIENT_ID"))
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(host, port, 60)
    client.loop_forever()


if __name__ == "__main__":
    main()
