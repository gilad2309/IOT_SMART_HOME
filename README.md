# DeepStream RTSP → WebRTC + MQTT + LED notifier

End-to-end flow: DeepStream runs YOLO, publishes RTSP, and sends person counts directly to MQTT (`deepstream/person_count`). A Jetson telemetry publisher reports GPU usage and temperature to MQTT (`jetson/internal/gpu_usage`, `jetson/internal/temperature`). A Data Manager subscribes to those streams, normalizes them, emits alarms, and forwards UI-ready metrics (`ui/metrics/*`). MediaMTX pulls RTSP and serves WHEP/WebRTC to the web UI. The web UI shows the stream, metrics, and alarm status. An LED notifier subscribes to MQTT and blinks a GPIO LED when person_count ≥ threshold. All of these can be started/stopped from the web “Start Pipeline” button.

## Prerequisites
- NVIDIA DeepStream 7.1 installed.
- RTSP camera URL set in `configs/DeepStream-Yolo/deepstream_app_config.txt` (`[source0].uri`).
- MediaMTX binary extracted to `./mediamtx` (from `mediamtx_v1.15.5_linux_arm64.tar.gz`).
- MQTT broker: Mosquitto service running on 1883 (TCP) and 9001 (WebSocket). The repo also has a Node broker if you need it.
- Node.js + npm installed (for server and UI).
- libmosquitto headers (for building DeepStream MQTT publisher): `sudo apt-get install -y libmosquitto-dev`
- Python 3 with `Jetson.GPIO` and `paho-mqtt` (for LED notifier): `sudo apt-get install python3-pip python3-paho-mqtt` (Jetson.GPIO is available on Jetson images).
- GPIO wiring: LED on BOARD pin 7 (default) with resistor to GND. Run the server with sudo so GPIO access works.

## Install (first time)
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
npm install
cd web-ui
npm install
npm run build
cd ..
```

## Run (single command + button)
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
sudo npm run serve
```
- Opens UI at http://127.0.0.1:8081
- `npm run serve` starts the server, Data Manager, and Jetson telemetry publisher (GPU usage + temperature).
- Click **Start Pipeline**. This starts:
  - `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt` (RTSP out on 8554, publishes MQTT counts)
  - `./mediamtx mediamtx.yml` (pull RTSP, serve WHEP at /ds-test/whep)
- `python3 person_led_mqtt.py` (subscribes to MQTT, blinks LED)
- Click **Stop** to terminate all.

Defaults you can override via env before `npm run serve`:
- `MQTT_URL` (Data Manager, default mqtt://mqtt-dashboard.com:1883)
- `MQTT_HOST`/`MQTT_PORT` (telemetry + LED, default mqtt-dashboard.com/1883)
- `MQTT_TOPIC` (LED notifier topic, default deepstream/person_count)
- `UI_METRICS_PREFIX` (default ui/metrics), `UI_ALARM_TOPIC` (default ui/alarms)
- `TEMP_WARN_C`/`TEMP_ALARM_C` (default 70/80), `GPU_WARN_PCT`/`GPU_ALARM_PCT` (default 85/95)
- `PERSON_THRESHOLD` (default 1), `LED_PIN` (default BOARD 7), `LED_HOLD_SECONDS` (default 5)

## Manual run (if you prefer separate terminals)
- DeepStream: `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt`
- MediaMTX: `./mediamtx mediamtx.yml`
- Web server: `npx http-server . -p 8081` (or any static server)
- MQTT broker: Mosquitto (`systemctl status mosquitto`) or `npm run mqtt-broker`
- LED notifier: `sudo MQTT_HOST=127.0.0.1 MQTT_PORT=1883 PERSON_THRESHOLD=1 LED_PIN=7 python3 person_led_mqtt.py`

## Quick checks
- RTSP sanity: `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,has_b_frames -of default=nw=1 rtsp://127.0.0.1:8554/ds-test`
- MediaMTX UI: `http://127.0.0.1:8889/` (should list `ds-test`)
- MQTT messages: `mosquitto_sub -h mqtt-dashboard.com -p 1883 -V mqttv311 -t ui/metrics/person_count -v`
- LED notifier logs: `logs/led_notifier.out.log` and `.err.log`
- Telemetry logs: `logs/telemetry.out.log` and `.err.log`

## Notes
- RTSP out: `rtsp://localhost:8554/ds-test`
- WHEP endpoint: `http://127.0.0.1:8889/ds-test/whep`
- UI connects to WHEP and to MQTT WS (default `wss://mqtt-dashboard.com:8884/mqtt` unless overridden).
- Run the server as sudo to allow the LED notifier to access GPIO. If you change pins or thresholds, export env vars before `npm run serve`.
