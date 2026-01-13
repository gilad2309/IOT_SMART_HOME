# System Overview

## Part 1: End-to-End Flow
This system runs a DeepStream pipeline that detects people in an RTSP stream, publishes metrics to MQTT, and visualizes the stream plus health signals in a web UI. A Data Manager consumes all MQTT streams, normalizes them, emits alarms, drives a relay actuator, and (optionally) persists data in AWS DynamoDB.

**Flow (high level)**
1) **DeepStream** ingests RTSP and runs YOLO.
2) **DeepStream → MQTT** publishes person counts to `deepstream/person_count`.
3) **Jetson telemetry** publishes:
   - GPU usage to `jetson/internal/gpu_usage`
   - Temperature to `jetson/internal/temperature`
4) **Data Manager** subscribes to those topics, normalizes the data, forwards UI-ready metrics to:
   - `ui/metrics/person_count`
   - `ui/metrics/gpu_usage`
   - `ui/metrics/temperature`
   and emits alarms to `ui/alarms`.
5) **Relay emulator** listens to `actuator/relay` and publishes `actuator/relay_status`.
6) **Web UI** shows the live stream, metrics, alarms, and relay state.
7) **AWS DynamoDB** (optional) stores metrics and alarms when enabled.

**Alarm flow**
- When GPU or temperature crosses warning/alarm thresholds, the Data Manager emits an alarm and turns the relay **on**.
- When both return to normal, the relay is turned **off**.

---

## Part 2: Requirements Mapping and Components

### a) Three types of emulators
1) **Producer emulator — Person count**  
   - Component: DeepStream (YOLO)  
   - Publishes to `deepstream/person_count`

2) **Producer emulator — Telemetry**  
   - Component: `backend/mqtt/jetson_telemetry.py`  
   - Publishes to `jetson/internal/gpu_usage`, `jetson/internal/temperature`

3) **Actuator emulator — Relay**  
   - Component: `backend/mqtt/relay_emulator.py`  
   - Listens to `actuator/relay`  
   - Publishes `actuator/relay_status`

**Extra actuator**
- LED notifier (`backend/mqtt/person_led_mqtt.py`) blinks a GPIO LED based on person count.

---

### b) Data Manager app
Component: `backend/mqtt/data_manager.py`

**Responsibilities**
- Subscribes to:  
  - `deepstream/person_count`  
  - `jetson/internal/gpu_usage`  
  - `jetson/internal/temperature`
- Normalizes messages into UI-ready formats.
- Aggregates person counts and publishes averages on the same cadence as telemetry.
- Emits alarms to `ui/alarms`.
- Drives relay state via `actuator/relay`.
- Persists metrics and alarms to AWS DynamoDB when enabled.

---

### c) Main GUI app
Component: `web-ui/`

**UI Features**
- Live stream (WHEP/WebRTC)
- Live metrics page:
  - People count
  - GPU usage + last update
  - Temperature + last update
  - Alarm state
  - Relay state

---

### d) Cloud DB
**AWS DynamoDB (optional, configurable)**
- Tables:
  - `metrics` (partition key `metric`, sort key `ts`)
  - `alarms` (partition key `type`, sort key `ts`)
- Enabled via:
  ```bash
  export DDB_ENABLED=1
  export AWS_ACCESS_KEY_ID=...
  export AWS_SECRET_ACCESS_KEY=...
  export AWS_REGION=eu-north-1
  export DDB_METRICS_TABLE=metrics
  export DDB_ALARMS_TABLE=alarms
  ```

**When enabled**, the Data Manager writes every normalized metric and alarm event to DynamoDB.
