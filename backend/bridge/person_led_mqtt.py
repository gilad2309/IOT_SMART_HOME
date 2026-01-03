"""
Minimal MQTT-to-LED trigger using the same Jetson.GPIO pattern you verified.
Turns LED on for HOLD_SECONDS when count >= PERSON_THRESHOLD.
"""

import json
import os
import sys
import threading
import time

# Match your working script hint
os.environ.setdefault("JETSON_MODEL_NAME", "JETSON_ORIN_NANO")
import Jetson.GPIO as GPIO
import paho.mqtt.client as mqtt

# Config
BROKER_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
BROKER_PORT = int(os.getenv("MQTT_PORT", "1883"))
TOPIC = os.getenv("MQTT_TOPIC", "deepstream/person_count")
THRESHOLD = float(os.getenv("PERSON_THRESHOLD", "3"))
HOLD_SECONDS = float(os.getenv("LED_HOLD_SECONDS", "5"))
LED_PIN = int(os.getenv("LED_PIN", "7"))  # BOARD pin number, like your test


GPIO.setwarnings(False)
GPIO.setmode(GPIO.BOARD)
GPIO.setup(LED_PIN, GPIO.OUT, initial=GPIO.LOW)

timer_lock = threading.Lock()
blink_thread: threading.Thread | None = None
stop_blink = threading.Event()
last_high_ts: float = 0.0


def set_led(state: bool):
    GPIO.output(LED_PIN, GPIO.HIGH if state else GPIO.LOW)


def blink_for_duration(duration: float, period: float = 0.5):
    """
    Blink LED for 'duration' seconds (toggle every 'period') after last high event.
    New high events reset the timer; low events stop immediately.
    """
    global blink_thread, last_high_ts, stop_blink

    def _worker():
        global blink_thread, last_high_ts
        state = False
        while True:
            with timer_lock:
                if stop_blink.is_set():
                    set_led(False)
                    blink_thread = None
                    return
                if time.time() - last_high_ts > duration:
                    set_led(False)
                    blink_thread = None
                    return
            state = not state
            set_led(state)
            time.sleep(period)

    with timer_lock:
        stop_blink.clear()
        last_high_ts = time.time()
        if blink_thread is None or not blink_thread.is_alive():
            blink_thread = threading.Thread(target=_worker, daemon=True)
            blink_thread.start()


def cleanup():
    with timer_lock:
        global blink_thread, last_high_ts
        stop_blink.set()
        last_high_ts = 0.0
        blink_thread = None
    set_led(False)
    GPIO.cleanup(LED_PIN)


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode("utf-8"))
        count = data.get("count", data.get("person_count", 0))
        count_val = float(count)
    except Exception:
        return
    if count_val >= THRESHOLD:
        print(f"[MQTT] count={count_val} >= {THRESHOLD} → LED BLINK {HOLD_SECONDS}s window")
        blink_for_duration(HOLD_SECONDS, period=0.5)
    else:
        print(f"[MQTT] count={count_val} < {THRESHOLD} → stop")
        stop_blink.set()
        set_led(False)


def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Connected rc={rc}; subscribing to {TOPIC}")
    client.subscribe(TOPIC)


def main():
    # Self-test blink
    print(f"[INIT] Self-test blink on LED pin {LED_PIN}")
    blink_for_duration(1.0, period=0.25)
    time.sleep(1.2)

    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER_HOST, BROKER_PORT, 60)
    client.loop_start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Exiting...")
    finally:
        client.loop_stop()
        client.disconnect()
        cleanup()
        sys.exit(0)


if __name__ == "__main__":
    main()
