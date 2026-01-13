"""
Data Manager: subscribe to device metrics, normalize, forward to UI topics, and emit alarms.
"""

import json
import os
import time

import paho.mqtt.client as mqtt

MQTT_URL = os.getenv("MQTT_URL", "mqtt://mqtt-dashboard.com:1883")
UI_METRICS_PREFIX = os.getenv("UI_METRICS_PREFIX", "ui/metrics")
UI_ALARM_TOPIC = os.getenv("UI_ALARM_TOPIC", "ui/alarms")
RELAY_COMMAND_TOPIC = os.getenv("RELAY_COMMAND_TOPIC", "actuator/relay")

TEMP_WARN_C = float(os.getenv("TEMP_WARN_C", "70"))
TEMP_ALARM_C = float(os.getenv("TEMP_ALARM_C", "80"))
GPU_WARN_PCT = float(os.getenv("GPU_WARN_PCT", "85"))
GPU_ALARM_PCT = float(os.getenv("GPU_ALARM_PCT", "95"))
RELAY_ON_LEVEL = os.getenv("RELAY_ON_LEVEL", "warning")

SOURCE_TOPICS = {
    "people": "deepstream/person_count",
    "temperature": "jetson/internal/temperature",
    "gpu": "jetson/internal/gpu_usage",
}

state = {
    "tempLevel": "normal",
    "gpuLevel": "normal",
    "relayState": "off",
}


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


def to_number(value):
    try:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.strip():
            return float(value)
    except Exception:
        return None
    return None


def publish_alarm(client, alarm_type: str, value: float, warn: float, alarm: float):
    level = "normal"
    if value >= alarm:
        level = "alarm"
    elif value >= warn:
        level = "warning"

    key = "tempLevel" if alarm_type == "temperature" else "gpuLevel"
    if state[key] == level:
        return
    state[key] = level

    payload = json.dumps(
        {
            "type": alarm_type,
            "level": level,
            "value": value,
            "threshold": alarm if level == "alarm" else warn,
            "ts": int(time.time() * 1000),
        }
    )
    client.publish(UI_ALARM_TOPIC, payload, qos=0, retain=False)
    maybe_toggle_relay(client)


def forward_metric(client, metric: str, payload: str):
    client.publish(f"{UI_METRICS_PREFIX}/{metric}", payload, qos=0, retain=False)


def should_relay_be_on() -> bool:
    if RELAY_ON_LEVEL == "alarm":
        return state["tempLevel"] == "alarm" or state["gpuLevel"] == "alarm"
    return state["tempLevel"] != "normal" or state["gpuLevel"] != "normal"


def maybe_toggle_relay(client):
    next_state = "on" if should_relay_be_on() else "off"
    if next_state == state["relayState"]:
        return
    state["relayState"] = next_state
    payload = json.dumps({"state": next_state, "source": "data_manager", "ts": int(time.time() * 1000)})
    client.publish(RELAY_COMMAND_TOPIC, payload, qos=0, retain=False)


def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[data-manager] connected {MQTT_URL}")
    for topic in SOURCE_TOPICS.values():
        client.subscribe(topic)


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        return

    if msg.topic == SOURCE_TOPICS["people"]:
        count = to_number(data.get("count", data.get("person_count", data.get("value"))))
        if count is None:
            return
        payload = json.dumps({"type": "person_count", "count": count, "ts": data.get("ts", int(time.time() * 1000))})
        forward_metric(client, "person_count", payload)
        return

    if msg.topic == SOURCE_TOPICS["gpu"]:
        percent = to_number(data.get("percent", data.get("usage", data.get("value"))))
        if percent is None:
            return
        payload = json.dumps({"type": "gpu_usage", "percent": percent, "ts": data.get("ts", int(time.time() * 1000))})
        forward_metric(client, "gpu_usage", payload)
        publish_alarm(client, "gpu_usage", percent, GPU_WARN_PCT, GPU_ALARM_PCT)
        return

    if msg.topic == SOURCE_TOPICS["temperature"]:
        celsius = to_number(data.get("celsius", data.get("temp", data.get("value"))))
        if celsius is None:
            return
        payload = json.dumps({"type": "temperature", "celsius": celsius, "ts": data.get("ts", int(time.time() * 1000))})
        forward_metric(client, "temperature", payload)
        publish_alarm(client, "temperature", celsius, TEMP_WARN_C, TEMP_ALARM_C)


def main():
    host, port = parse_mqtt_url(MQTT_URL)
    client = mqtt.Client(client_id=os.getenv("MQTT_CLIENT_ID"))
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(host, port, 60)
    client.loop_forever()


if __name__ == "__main__":
    main()
