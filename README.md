# DeepStream RTSP → WebRTC + MQTT + Data Manager + Cloud + LED

End-to-end flow: DeepStream runs YOLO, publishes RTSP, and sends person counts to MQTT (`deepstream/person_count`). A Jetson telemetry publisher reports GPU usage and temperature to MQTT (`jetson/internal/gpu_usage`, `jetson/internal/temperature`). The Data Manager subscribes, normalizes, emits alarms, forwards UI-ready metrics (`ui/metrics/*`), and writes to DynamoDB. MediaMTX pulls RTSP and serves WHEP/WebRTC to the web UI. The web UI shows the stream, metrics, charts, and alarm state. The Data Manager also publishes LED commands to `actuator/led_toggle`, and the LED notifier listens to that topic and blinks a GPIO LED. All of these can be started/stopped from the web “Start Pipeline” button.

## Prerequisites
- NVIDIA DeepStream 7.1 installed.
- RTSP camera URL set in `configs/DeepStream-Yolo/deepstream_app_config.txt` (`[source0].uri`).
- MediaMTX binary extracted to `./mediamtx` (from `mediamtx_v1.15.5_linux_arm64.tar.gz`).
- MQTT broker: Mosquitto on 1883/9001, or a public broker (default: mqtt-dashboard.com).
- Node.js + npm installed (for server and UI).
- libmosquitto headers (for building DeepStream MQTT publisher): `sudo apt-get install -y libmosquitto-dev`
- Python 3 with `Jetson.GPIO` and `paho-mqtt` (for LED notifier + data manager + relay emulator): `sudo apt-get install python3-pip python3-paho-mqtt` (Jetson.GPIO is available on Jetson images).
- DynamoDB client (AWS cloud DB): `python3 -m pip install boto3`
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

## Run (manual, single command + button)
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
./scripts/run-no-ddb.sh
```
- Opens UI at http://127.0.0.1:8081
- `npm run serve` starts the server, Data Manager, relay emulator, and Jetson telemetry publisher (GPU usage + temperature).
- Click **Start Pipeline**. This starts:
  - `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt` (RTSP out on 8554, publishes MQTT counts)
  - `./mediamtx mediamtx.yml` (pull RTSP, serve WHEP at /ds-test/whep)
  - `python3 backend/mqtt/person_led_mqtt.py` (subscribes to `actuator/led_toggle`, blinks LED)
- Click **Stop** to terminate all.

Manual DB mode:
```bash
./scripts/run-ddb.sh
```

Defaults you can override via `/etc/jetson-iot/command_listener.env`:
- `MQTT_URL` (Data Manager, default mqtt://mqtt-dashboard.com:1883)
- `MQTT_HOST`/`MQTT_PORT` (telemetry + LED, default mqtt-dashboard.com/1883)
- `UI_METRICS_PREFIX` (default ui/metrics), `UI_ALARM_TOPIC` (default ui/alarms)
- `TEMP_WARN_C`/`TEMP_ALARM_C` (default 70/80), `GPU_WARN_PCT`/`GPU_ALARM_PCT` (default 85/95)
- `LED_TOGGLE_TOPIC` (default actuator/led_toggle), `LED_PIN` (default BOARD 7), `LED_HOLD_SECONDS` (default 5)
- `RELAY_COMMAND_TOPIC` (default actuator/relay), `RELAY_STATUS_TOPIC` (default actuator/relay_status)
- `RELAY_ON_LEVEL` (default warning) controls when the Data Manager turns the relay on
- `DDB_ENABLED` (set to 1 to enable), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
  `DDB_METRICS_TABLE`, `DDB_ALARMS_TABLE`

## Native vs Web mode
- **Switch to Native** stops MediaMTX and restarts DeepStream with the native config so only the local DeepStream window is active.
- **Switch to Web** restarts DeepStream with the web config and brings MediaMTX back for WHEP.
- Native config file: `backend/deepstream/configs/DeepStream-Yolo/deepstream_app_config_native.txt`

## Manual run (if you prefer separate terminals)
- DeepStream: `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt`
- MediaMTX: `./mediamtx mediamtx.yml`
- Web server: `npx http-server . -p 8081` (or any static server)
- MQTT broker: Mosquitto (`systemctl status mosquitto`) or a public broker
- LED notifier: `sudo MQTT_HOST=127.0.0.1 MQTT_PORT=1883 LED_TOGGLE_TOPIC=actuator/led_toggle LED_PIN=7 python3 backend/mqtt/person_led_mqtt.py`
 - Data Manager: `python3 backend/mqtt/data_manager.py`

## Run via Telegram (commands)
The Telegram flow starts the server and pipeline on demand via AWS IoT Core.

Commands:
- `run` → `npm run serve -- --no-ddb`
- `run -db` → `npm run serve -- --ddb`
- `start pipeline` → same as UI Start Pipeline
- `stop` → stops the running server process

Prereqs:
- `jetson-command-listener.service` enabled and running.
- `/etc/jetson-iot/command_listener.env` filled with AWS/MQTT settings.

## Quick checks
- RTSP sanity: `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,has_b_frames -of default=nw=1 rtsp://127.0.0.1:8554/ds-test`
- MediaMTX UI: `http://127.0.0.1:8889/` (should list `ds-test`)
- MQTT messages: `mosquitto_sub -h mqtt-dashboard.com -p 1883 -V mqttv311 -t ui/metrics/person_count -v`
- LED notifier logs: `logs/led_notifier.out.log` and `.err.log`
- Telemetry logs: `logs/telemetry.out.log` and `.err.log`
- Relay emulator logs: `logs/relay_emulator.out.log` and `.err.log`

## DynamoDB setup (cloud DB)
Create tables:
- `metrics` with partition key `metric` (String) and sort key `ts` (Number)
- `alarms` with partition key `type` (String) and sort key `ts` (Number)

Create AWS access keys:
1) AWS Console → IAM → Users → select your user
2) Security credentials → Access keys → Create access key
3) Choose “Application running outside AWS”, download the key pair

Set env vars:
```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=eu-north-1
export DDB_METRICS_TABLE=metrics
export DDB_ALARMS_TABLE=alarms
export DDB_ENABLED=1
```
Note: If you reboot the PC, you must export these again (unless you add them to `~/.bashrc` or a `.env` file).

## Telegram bot alerts (optional)
See `telegram_bot/README.md` for the full step-by-step setup (Lambda + DynamoDB Streams).

## Notes
- RTSP out: `rtsp://localhost:8554/ds-test`
- WHEP endpoint: `http://127.0.0.1:8889/ds-test/whep`
- UI connects to WHEP and to MQTT WS (default `wss://mqtt-dashboard.com:8884/mqtt` unless overridden).
- Run the server as sudo to allow the LED notifier to access GPIO. If you change pins or thresholds, export env vars before `npm run serve`.
