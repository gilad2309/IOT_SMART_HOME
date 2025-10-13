# DeepStream Kafka Integration Guide

This guide explains how to run Apache Kafka in the background and configure a DeepStream app to act as a Kafka **producer**.  
The DeepStream app will publish object detection metadata (inference results) to a Kafka topic.

---

## 🧩 Prerequisites

- Kafka 4.x or later installed (KRaft mode recommended)
- Java 17+ installed
- NVIDIA DeepStream SDK installed (7.x+)
- Basic knowledge of terminal commands

---

## ⚙️ 1. Start Kafka (in background)

```bash
cd ~/kafka/kafka_2.13-4.1.0
bin/kafka-server-start.sh -daemon config/kraft/server-local.properties
```

Verify that Kafka is running:
```bash
ss -ltnp | grep 9092
```

You should see output similar to:
```
LISTEN 0 50 *:9092 *:* users:(("java",pid=49064,...))
```

---

## 📦 2. Create a Kafka topic for DeepStream

```bash
cd ~/kafka/kafka_2.13-4.1.0
bin/kafka-topics.sh --create   --topic ds-events   --partitions 1   --replication-factor 1   --bootstrap-server 127.0.0.1:9092
```

Verify the topic exists:
```bash
bin/kafka-topics.sh --list --bootstrap-server 127.0.0.1:9092
```

---

## 🧠 3. Configure DeepStream as a Kafka Producer

Edit your DeepStream configuration file  
(e.g. `configs/test5_config_file_src_infer.yml` or `.txt` depending on your app).

Add or modify the **Kafka sink section**:

```ini
[sink1]
enable=1
type=6                            # message broker
msg-broker-proto-lib=/opt/nvidia/deepstream/lib/libnvds_kafka_proto.so
msg-broker-conn-str=192.168.68.107;9092   # use localhost if Kafka runs on same machine
topic=ds-events
msg-broker-config=/home/gilad/ds_kafka_debug.conf
sync=0
```

Optional debug configuration file (save as `/home/gilad/ds_kafka_debug.conf`):

```ini
client.id=deepstream-app
request.required.acks=1
message.timeout.ms=30000
debug=broker,topic,msg,protocol,metadata
api.version.request=true
```

---

## 🚀 4. Run DeepStream Application

Run the DeepStream app with your config file:

```bash
cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5
./deepstream-test5-app -c configs/copy_test5_config_file_src_infer.yml
```

DeepStream will now publish inference results (object detections, metadata) to the Kafka topic.

---

## 👀 5. View Kafka Messages (Consumer)

Open another terminal and run:

```bash
cd ~/kafka/kafka_2.13-4.1.0
bin/kafka-console-consumer.sh --bootstrap-server 127.0.0.1:9092 --topic ds-events --from-beginning
```






# DeepStream-Test5 Custom Configuration

## 🧩 Things Added to the DeepStream-Test5 Project

### 📁 In `copy_test5_config_file_src_infer.yml`

#### ✅ Added CSV Source File
Created a new `.csv` file containing the RTSP camera URI:
```yaml
source:
  csv-file-path: my_sources.csv
```

---

#### ✅ Modified Sink1 Section
Configured Sink1 to use **Kafka** as a message broker:

```yaml
sink1:
  enable: 1
  #Type - 1=FakeSink 2=EglSink 3=File 4=UDPSink 5=nvdrmvideosink 6=MsgConvBroker
  type: 6
  msg-conv-config: dstest5_msgconv_sample_config.yml
  #(0): PAYLOAD_DEEPSTREAM - Deepstream schema payload
  #(1): PAYLOAD_DEEPSTREAM_MINIMAL - Deepstream schema payload minimal
  #(256): PAYLOAD_RESERVED - Reserved type
  #(257): PAYLOAD_CUSTOM   - Custom schema payload
  msg-conv-payload-type: 0
  msg-broker-proto-lib: /opt/nvidia/deepstream/deepstream/lib/libnvds_kafka_proto.so
  #Provide your msg-broker-conn-str here
  msg-broker-conn-str: 192.168.68.107;9092;ds-test5
  topic: ds-events
  #Optional:
  #msg-broker-config: ../../deepstream-test4/cfg_kafka.txt
```

---

#### ✅ Modified Primary-GIE Section
Configured to use **YOLOv11 ONNX model** instead of the default ResNet engine:

```yaml
primary-gie:
  enable: 1
  gpu-id: 0
  batch-size: 1
  ## 0=FP32, 1=INT8, 2=FP16 mode
  bbox-border-color0: 1;0;0;1
  bbox-border-color1: 0;1;1;1
  bbox-border-color2: 0;1;1;1
  bbox-border-color3: 0;1;0;1
  nvbuf-memory-type: 0
  interval: 0
  gie-unique-id: 1
  model-engine-file: yolo11s.pt.onnx
  labelfile-path: labels.txt
  config-file : config_infer_primary_yoloV8.txt
  #infer-raw-output-dir: ../../../../../samples/primary_detector_raw_output/
```

---

### 🧠 Added New File: `config_infer_primary_yoloV8.txt`

Created this configuration file under the `deepstream-test5` directory:

```ini
[property]
gpu-id=0
net-scale-factor=0.0039215697906911373
model-color-format=0
onnx-file=DeepStream-Yolo/yolo11s.pt.onnx
model-engine-file=DeepStream-Yolo/model_b1_gpu0_fp32.engine
#int8-calib-file=calib.table
labelfile-path=DeepStream-Yolo/labels.txt
batch-size=1
network-mode=0
num-detected-classes=80
interval=0
gie-unique-id=1
process-mode=1
network-type=0
cluster-mode=2
maintain-aspect-ratio=1
symmetric-padding=1
#workspace-size=2000
parse-bbox-func-name=NvDsInferParseYolo
#parse-bbox-func-name=NvDsInferParseYoloCuda
custom-lib-path=DeepStream-Yolo/nvdsinfer_custom_impl_Yolo/libnvdsinfer_custom_impl_Yolo.so
engine-create-func-name=NvDsInferYoloCudaEngineGet

[class-attrs-all]
nms-iou-threshold=0.45
pre-cluster-threshold=0.25
topk=300
```

---

### 📂 copy Directory
copy the DeepStream-Yolo directory under the `deepstream-test5` folder, containing:
- `yolo11s.pt.onnx`
- `labels.txt`
- `nvdsinfer_custom_impl_Yolo/libnvdsinfer_custom_impl_Yolo.so`
- `and more ...`

---

## 🚀 How to Run the Project

1. **Ensure Kafka is running properly**
   ```bash
   ss -ltnp | grep 9092
   ```

2. **Run DeepStream-Test5 Application**
   ```bash
   cd ~/deepstream/deepstream-7.1/sources/apps/sample_apps/deepstream-test5/
   ./deepstream-test5-app -c configs/copy_test5_config_file_src_infer.yml
   ```

If everything is configured correctly, DeepStream will perform YOLO inference and publish the object detection results to your Kafka topic (`ds-events`).




