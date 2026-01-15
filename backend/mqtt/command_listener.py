"""
Listen for MQTT commands and run a shell command on demand.
"""

import json
import os
import shlex
import subprocess
import time
import urllib.request
from typing import Optional
import signal

import paho.mqtt.client as mqtt

ENV_FILE = os.getenv("COMMAND_LISTENER_ENV", "/etc/jetson-iot/command_listener.env")


def load_env_file(path: str) -> None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())
    except FileNotFoundError:
        return


load_env_file(ENV_FILE)

MQTT_URL = os.getenv("MQTT_URL", "mqtt://mqtt-dashboard.com:1883")
MQTT_HOST = os.getenv("MQTT_HOST")
MQTT_PORT = os.getenv("MQTT_PORT")
MQTT_TLS_ENABLED = os.getenv("MQTT_TLS_ENABLED", "0") == "1"
MQTT_CA_CERT = os.getenv("MQTT_CA_CERT")
MQTT_CLIENT_CERT = os.getenv("MQTT_CLIENT_CERT")
MQTT_CLIENT_KEY = os.getenv("MQTT_CLIENT_KEY")
MQTT_TLS_INSECURE = os.getenv("MQTT_TLS_INSECURE", "0") == "1"
COMMAND_TOPIC = os.getenv("COMMAND_TOPIC", "jetson/command")
TRIGGER_TEXT = os.getenv("TRIGGER_TEXT", "run").strip().lower()
START_PIPELINE_TEXT = os.getenv("START_PIPELINE_TEXT", "start pipeline").strip().lower()
PIPELINE_API_URL = os.getenv("PIPELINE_API_URL", "http://127.0.0.1:8081/api/start")
RUN_COMMAND = os.getenv("RUN_COMMAND", "npm run serve -- --no-ddb")
RUN_DB_TEXT = os.getenv("RUN_DB_TEXT", "run -db").strip().lower()
RUN_DB_COMMAND = os.getenv("RUN_DB_COMMAND", "npm run serve -- --ddb")
STOP_TEXT = os.getenv("STOP_TEXT", "stop").strip().lower()
COMMAND_CWD = os.getenv(
    "COMMAND_CWD",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
)
COOLDOWN_SECONDS = float(os.getenv("COMMAND_COOLDOWN_SECONDS", "2"))

last_trigger_at = 0.0
current_process = None
connect_host = None
connect_port = None
connect_tls = False


def parse_mqtt_url(url: str) -> tuple[str, int]:
    if "://" in url:
        scheme, rest = url.split("://", 1)
    else:
        scheme = "mqtt"
        rest = url
    if "/" in rest:
        rest = rest.split("/", 1)[0]
    if ":" in rest:
        host, port = rest.split(":", 1)
        return host, int(port)
    default_port = 8883 if scheme == "mqtts" else 1883
    return rest, default_port


def extract_command_text(payload: str) -> Optional[str]:
    try:
        data = json.loads(payload)
    except Exception:
        data = None

    if isinstance(data, dict):
        for key in ("command", "action", "text", "message"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    if payload.strip():
        return payload.strip()
    return None


def start_command():
    global current_process
    if current_process and current_process.poll() is None:
        print("[command-listener] command already running")
        return

    args = shlex.split(RUN_COMMAND)
    print(f"[command-listener] starting: {RUN_COMMAND}")
    env = os.environ.copy()
    if env.get("KEEP_MQTT_ENV_FOR_COMMAND", "0") != "1":
        # Avoid leaking AWS IoT MQTT settings into the app we are starting.
        for key in (
            "MQTT_URL",
            "MQTT_HOST",
            "MQTT_PORT",
            "MQTT_TLS_ENABLED",
            "MQTT_CA_CERT",
            "MQTT_CLIENT_CERT",
            "MQTT_CLIENT_KEY",
            "MQTT_TLS_INSECURE",
        ):
            env.pop(key, None)
    current_process = subprocess.Popen(args, cwd=COMMAND_CWD, env=env, start_new_session=True)

def start_db_command():
    global current_process
    if current_process and current_process.poll() is None:
        print("[command-listener] command already running")
        return

    args = shlex.split(RUN_DB_COMMAND)
    print(f"[command-listener] starting: {RUN_DB_COMMAND}")
    env = os.environ.copy()
    if env.get("KEEP_MQTT_ENV_FOR_COMMAND", "0") != "1":
        for key in (
            "MQTT_URL",
            "MQTT_HOST",
            "MQTT_PORT",
            "MQTT_TLS_ENABLED",
            "MQTT_CA_CERT",
            "MQTT_CLIENT_CERT",
            "MQTT_CLIENT_KEY",
            "MQTT_TLS_INSECURE",
        ):
            env.pop(key, None)
    current_process = subprocess.Popen(args, cwd=COMMAND_CWD, env=env, start_new_session=True)


def stop_command():
    global current_process
    if not current_process or current_process.poll() is not None:
        print("[command-listener] no command running")
        return
    try:
        os.killpg(current_process.pid, signal.SIGTERM)
        current_process.wait(timeout=10)
    except Exception:
        try:
            os.killpg(current_process.pid, signal.SIGKILL)
        except Exception:
            pass
    current_process = None


def on_connect(client, userdata, flags, rc, properties=None):
    tls_label = "tls" if connect_tls else "plain"
    print(f"[command-listener] connected {connect_host}:{connect_port} ({tls_label}); topic={COMMAND_TOPIC}")
    client.subscribe(COMMAND_TOPIC)


def on_message(client, userdata, msg):
    global last_trigger_at
    text = extract_command_text(msg.payload.decode("utf-8", errors="ignore"))
    if not text:
        return

    normalized = text.strip().lower()
    now = time.time()
    if now - last_trigger_at < COOLDOWN_SECONDS:
        return
    last_trigger_at = now
    if normalized == TRIGGER_TEXT:
        start_command()
        return
    if normalized == RUN_DB_TEXT:
        start_db_command()
        return
    if normalized == STOP_TEXT:
        stop_command()
        return
    if normalized == START_PIPELINE_TEXT:
        start_pipeline()
        return


def start_pipeline():
    try:
        req = urllib.request.Request(PIPELINE_API_URL, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
        print(f"[command-listener] start pipeline: {resp.status} {body[:200]}")
    except Exception as exc:
        print(f"[command-listener] start pipeline failed: {exc}")


def main():
    global connect_host, connect_port, connect_tls
    if MQTT_HOST:
        host = MQTT_HOST
        port = int(MQTT_PORT or "8883")
    else:
        host, port = parse_mqtt_url(MQTT_URL)
    client = mqtt.Client(client_id=os.getenv("MQTT_CLIENT_ID"))
    connect_tls = MQTT_TLS_ENABLED or port == 8883 or MQTT_URL.startswith("mqtts://")
    if connect_tls:
        if not MQTT_CA_CERT or not MQTT_CLIENT_CERT or not MQTT_CLIENT_KEY:
            raise RuntimeError("MQTT TLS enabled but cert paths are missing")
        client.tls_set(
            ca_certs=MQTT_CA_CERT,
            certfile=MQTT_CLIENT_CERT,
            keyfile=MQTT_CLIENT_KEY,
        )
        if MQTT_TLS_INSECURE:
            client.tls_insecure_set(True)
    connect_host = host
    connect_port = port
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(host, port, 60)
    client.loop_forever()


if __name__ == "__main__":
    main()
