# DeepStream RTSP → WebRTC + MQTT + LED notifier

End-to-end flow: DeepStream runs YOLO and publishes RTSP. MediaMTX pulls RTSP and serves WHEP/WebRTC to the web UI. A UDP→MQTT bridge publishes person counts to `deepstream/person_count`. The web UI shows the stream and live counts. An LED notifier subscribes to MQTT and blinks a GPIO LED when person_count ≥ threshold. All of these can be started/stopped from the web “Start Pipeline” button.

## Prerequisites
- NVIDIA DeepStream 7.1 installed.
- RTSP camera URL set in `configs/DeepStream-Yolo/deepstream_app_config.txt` (`[source0].uri`).
- MediaMTX binary extracted to `./mediamtx` (from `mediamtx_v1.15.5_linux_arm64.tar.gz`).
- MQTT broker: Mosquitto service running on 1883 (TCP) and 9001 (WebSocket). The repo also has a Node broker if you need it.
- Node.js + npm installed (for server, bridge, UI).
- Python 3 with `Jetson.GPIO` and `paho-mqtt` (for LED notifier): `sudo apt-get install python3-pip python3-paho-mqtt` (Jetson.GPIO is available on Jetson images).
- GPIO wiring: LED on BOARD pin 7 (default) with resistor to GND. Run the server with sudo so GPIO access works.

## Install (first time)
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
npm install
```

## Run (single command + button)
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
sudo npm run serve
```
- Opens UI at http://127.0.0.1:8081
- Click **Start Pipeline**. This starts:
  - `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt` (RTSP out on 8554)
  - `./mediamtx mediamtx.yml` (pull RTSP, serve WHEP at /ds-test/whep)
  - `node person_mqtt_bridge.js` (UDP → MQTT at deepstream/person_count)
  - `python3 person_led_mqtt.py` (subscribes to MQTT, blinks LED)
- Click **Stop** to terminate all.

Defaults you can override via env before `npm run serve`:
- `MQTT_HOST`/`MQTT_PORT` (default 127.0.0.1/1883)
- `MQTT_TOPIC` (default deepstream/person_count)
- `PERSON_THRESHOLD` (default 1), `LED_PIN` (default BOARD 7), `LED_HOLD_SECONDS` (default 5)

## Manual run (if you prefer separate terminals)
- DeepStream: `./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt`
- MediaMTX: `./mediamtx mediamtx.yml`
- Web server: `npx http-server . -p 8081` (or any static server)
- MQTT broker: Mosquitto (`systemctl status mosquitto`) or `npm run mqtt-broker`
- UDP→MQTT bridge: `MQTT_URL=mqtt://127.0.0.1:1883 MQTT_TOPIC=deepstream/person_count node person_mqtt_bridge.js`
- LED notifier: `sudo MQTT_HOST=127.0.0.1 MQTT_PORT=1883 PERSON_THRESHOLD=1 LED_PIN=7 python3 person_led_mqtt.py`

## Quick checks
- RTSP sanity: `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,has_b_frames -of default=nw=1 rtsp://127.0.0.1:8554/ds-test`
- MediaMTX UI: `http://127.0.0.1:8889/` (should list `ds-test`)
- MQTT messages: `mosquitto_sub -h 127.0.0.1 -t deepstream/person_count -v`
- LED notifier logs: `logs/led_notifier.out.log` and `.err.log`

## Notes
- RTSP out: `rtsp://localhost:8554/ds-test`
- WHEP endpoint: `http://127.0.0.1:8889/ds-test/whep`
- UI connects to WHEP and to MQTT WS (default `ws://127.0.0.1:9001` if using Node broker; Mosquitto WS must be enabled separately).
- Run the server as sudo to allow the LED notifier to access GPIO. If you change pins or thresholds, export env vars before `npm run serve`.
