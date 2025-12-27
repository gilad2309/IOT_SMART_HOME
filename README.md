# DeepStream RTSP → WebRTC Demo (YOLO + overlays)

This repo now streams RTSP from DeepStream (with YOLO overlays) and serves it to the browser via MediaMTX (WHEP) and a simple web page.

## Prerequisites
- NVIDIA DeepStream 7.1 installed.
- Your RTSP camera URL set in `configs/DeepStream-Yolo/deepstream_app_config.txt` (`[source0].uri`).
- MediaMTX binary in this folder (`./mediamtx_v1.15.5_linux_arm64.tar.gz` extracted to `./mediamtx`).
- Node (for `npx http-server`).

## Run (three terminals)
Terminal 1 – DeepStream (RTSP out on 8554):
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
./deepstream-test5-app -c configs/DeepStream-Yolo/deepstream_app_config.txt
```

Terminal 2 – MediaMTX (RTSP → WebRTC/WHEP):
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
./mediamtx mediamtx.yml
```

Terminal 3 – Serve the web page:
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
npx http-server . -p 8081
```

Terminal 4 – Start MQTT broker (TCP 1883 + WS 9001):
- Preferred: Mosquitto with WebSocket listener, e.g. in your mosquitto config:
  ```
  listener 1883
  protocol mqtt

  listener 9001
  protocol websockets
  allow_anonymous true
  ```
  then `sudo systemctl restart mosquitto`.
- Bundled fallback (Node broker in this repo):
  ```bash
  cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
  npm install
  npm run mqtt-broker
  ```

Terminal 5 – MQTT bridge (UDP → MQTT):
```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
MQTT_URL=mqtt://127.0.0.1:1883 MQTT_TOPIC=deepstream/person_count node person_mqtt_bridge.js
```

Browser: open `http://127.0.0.1:8081/` and you should see the live video with overlays and a live person count (from MQTT).

## Quick checks
- Verify RTSP locally:
  ```bash
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,has_b_frames -of default=nw=1 rtsp://127.0.0.1:8554/ds-test
  ```
  Expect `profile=Constrained Baseline` and `has_b_frames=0`.
- MediaMTX UI: `http://127.0.0.1:8889/` (should list `ds-test`).

## Notes
- RTSP output path is `rtsp://localhost:8554/ds-test`.
- `mediamtx.yml` is configured to pull that RTSP and expose WHEP at `/ds-test/whep`.
- If port 8081 is busy, pick another (`-p 8082`) and open that in the browser.
- If your camera is H265, switch it to H264 or add a compatible decode path before inference.
- MQTT broker: bundled Node broker in this repo (`npm run mqtt-broker`) exposes MQTT on 1883 and WebSocket on 9001. The web page connects to `ws://127.0.0.1:9001` and subscribes to `deepstream/person_count`. The bridge publishes the person count to the broker.
