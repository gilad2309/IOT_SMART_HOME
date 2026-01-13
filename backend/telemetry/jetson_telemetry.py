"""
Publish Jetson GPU usage + temperature to MQTT.
Topics:
  - jetson/internal/gpu_usage
  - jetson/internal/temperature
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt


MQTT_HOST = os.getenv("MQTT_HOST", "mqtt-dashboard.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "jetson-telemetry")
MQTT_QOS = int(os.getenv("MQTT_QOS", "0"))
INTERVAL = float(os.getenv("TELEMETRY_INTERVAL_SECONDS", "5"))
DEBUG = os.getenv("TELEMETRY_DEBUG", "0") == "1"

TOPIC_GPU = "jetson/internal/gpu_usage"
TOPIC_TEMP = "jetson/internal/temperature"


def _read_first(paths: list[Path]) -> str | None:
    for p in paths:
        try:
            return p.read_text().strip()
        except Exception:
            continue
    return None


def read_gpu_usage_percent() -> float | None:
    # Common Jetson paths; values are 0..1000 for 0..100% on many devices.
    candidates = [
        Path("/sys/devices/gpu.0/load"),
        Path("/sys/devices/17000000.ga10b/load"),
        Path("/sys/devices/57000000.gpu/load"),
    ]
    raw = _read_first(candidates)
    if raw is None:
        gpu, _ = read_from_tegrastats()
        return gpu
    try:
        val = float(raw)
        if val > 100:
            return round(val / 10.0, 2)
        return round(val, 2)
    except Exception:
        return None


def read_temperature_c() -> float | None:
    # Prefer GPU therm if present, otherwise take the max temp.
    zones = list(Path("/sys/devices/virtual/thermal").glob("thermal_zone*"))
    best = None
    best_type = None
    for zone in zones:
        try:
            ztype = (zone / "type").read_text().strip()
            ztemp = (zone / "temp").read_text().strip()
        except Exception:
            continue
        try:
            temp_c = float(ztemp) / 1000.0
        except Exception:
            continue
        if ztype.lower().startswith("gpu"):
            return round(temp_c, 2)
        if best is None or temp_c > best:
            best = temp_c
            best_type = ztype
    if best is not None:
        return round(best, 2)
    _, temp = read_from_tegrastats()
    return temp


def read_from_tegrastats() -> tuple[float | None, float | None]:
    try:
        proc = subprocess.Popen(
            ["tegrastats", "--interval", "1000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        return (None, None)

    try:
        line = proc.stdout.readline() if proc.stdout else ""
    except Exception:
        line = ""
    finally:
        try:
            proc.terminate()
        except Exception:
            pass

    if not line:
        return (None, None)
    gpu_match = re.search(r"GR3D_FREQ\s+(\d+)%", line)
    temp_match = re.search(r"GPU@([0-9.]+)C", line, re.IGNORECASE)
    gpu = None
    temp = None
    if gpu_match:
        try:
            gpu = float(gpu_match.group(1))
        except Exception:
            gpu = None
    if temp_match:
        try:
            temp = float(temp_match.group(1))
        except Exception:
            temp = None
    return (gpu, temp)


def main() -> None:
    client = mqtt.Client(client_id=MQTT_CLIENT_ID)
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_start()

    print(f"[telemetry] MQTT {MQTT_HOST}:{MQTT_PORT} interval={INTERVAL}s")

    try:
        while True:
            ts = int(time.time() * 1000)
            gpu = read_gpu_usage_percent()
            temp = read_temperature_c()
            if gpu is not None:
                payload = json.dumps({"type": "gpu_usage", "percent": gpu, "ts": ts})
                info = client.publish(TOPIC_GPU, payload, qos=MQTT_QOS, retain=False)
                if DEBUG:
                    print(f"[telemetry] {TOPIC_GPU} {payload} rc={info.rc}")
            if temp is not None:
                payload = json.dumps({"type": "temperature", "celsius": temp, "ts": ts})
                info = client.publish(TOPIC_TEMP, payload, qos=MQTT_QOS, retain=False)
                if DEBUG:
                    print(f"[telemetry] {TOPIC_TEMP} {payload} rc={info.rc}")
            if DEBUG and gpu is None and temp is None:
                print("[telemetry] No telemetry values found this cycle")
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
