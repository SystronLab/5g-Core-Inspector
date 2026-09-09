# 5G Core Inspector

**5G Core Inspector** is an experimental platform for observability, event correlation, and root-cause analysis in distributed 5G Core networks.

It collects logs from multiple Open5GS Network Functions (NFs), streams them through Kafka, correlates events across NFs, and provides a higher-level view of UE procedures and incidents.

## Architecture

```text
OAI UE
  |
OCUDU gNB
  |
Split Open5GS 5G Core
  |
RCA Log Agent
  |
Kafka
  |
RCA Ingester
  |
Demo UI
```

## Repositories

| Component | Repository |
|---|---|
| OCUDU | https://github.com/SystronLab/ocudu |
| Open5GS | https://github.com/SystronLab/open5gs |
| Kafka Setup | https://github.com/SystronLab/kafka-setup |
| RCA Log Agent | https://github.com/SystronLab/rca-log-agent |
| RCA Ingester | https://github.com/SystronLab/rca-ingester |
| OpenAirInterface 5G | https://gitlab.eurecom.fr/oai/openairinterface5g.git |

The component repositories are included in this parent repository as **Git submodules**.

## Clone

```bash
git clone --recurse-submodules https://github.com/SystronLab/5g-Core-Inspector.git
cd 5g-Core-Inspector
```

If the repository was cloned without its submodules:

```bash
git submodule update --init --recursive
```

---

# Installation

The following steps are required for the initial installation.

## 1. Stop Native Open5GS Services

The Docker-based 5G Core should not run alongside native Open5GS services using the same interfaces and ports.

```bash
sudo systemctl stop open5gs-mmed
sudo systemctl stop open5gs-sgwcd
sudo systemctl stop open5gs-smfd
sudo systemctl stop open5gs-amfd
sudo systemctl stop open5gs-sgwud
sudo systemctl stop open5gs-upfd
sudo systemctl stop open5gs-hssd
sudo systemctl stop open5gs-pcrfd
sudo systemctl stop open5gs-nrfd
sudo systemctl stop open5gs-scpd
sudo systemctl stop open5gs-seppd
sudo systemctl stop open5gs-ausfd
sudo systemctl stop open5gs-udmd
sudo systemctl stop open5gs-pcfd
sudo systemctl stop open5gs-nssfd
sudo systemctl stop open5gs-bsfd
sudo systemctl stop open5gs-udrd
sudo systemctl stop open5gs-webui
```

## 2. Build the Split Open5GS Core

```bash
cd ocudu
```

Pull MongoDB once:

```bash
sudo docker pull mongo:6
```

Build the Open5GS image:

```bash
sudo docker compose \
  -f docker/open5gs-split/docker-compose.yml \
  build --no-cache nrf
```

For the parent repository layout, correct the subscriber helper mount if required:

```bash
sed -i \
  's#../../../../open5gs/misc#../../../open5gs/misc#' \
  docker/open5gs-split/docker-compose.yml
```

Verify:

```bash
grep -A6 'add_users.py' docker/open5gs-split/docker-compose.yml
```

Start the split core:

```bash
sudo docker compose \
  -f docker/open5gs-split/docker-compose.yml \
  up -d \
  --no-build \
  --pull never \
  mongodb nrf scp udr udm ausf pcf nssf bsf amf upf smf
```

Check the containers:

```bash
sudo docker ps
```

## 3. Initialise the Test Subscriber

```bash
sudo docker compose \
  -f docker/open5gs-split/docker-compose.yml \
  up subscriber-init
```

Verify the subscriber:

```bash
sudo docker exec open5gs_mongodb \
  mongosh open5gs --quiet \
  --eval 'db.subscribers.find({}, {imsi:1, _id:0}).toArray()'
```

Test IMSI:

```text
001010123456780
```

## 4. Install Kafka

```bash
cd ../kafka-setup

sudo docker compose \
  -f docker-compose.kafka.yml \
  up -d
```

Create the Kafka topics:

```bash
sudo docker compose \
  -f docker-compose.kafka.yml \
  exec kafka /scripts/create-topics.sh
```

Connect Kafka to the 5G Core network:

```bash
sudo docker network connect \
  open5gs-split-5gc \
  5gi-kafka
```

Kafka UI is available at:

```text
http://localhost:8080
```

## 5. Install the RCA Log Agent

```bash
cd ../rca-log-agent

sudo docker build -t 5gi-log-agent:latest .

sudo docker volume create 5gi-log-agent-data
```

Start the log agent:

```bash
sudo docker run -d \
  --name 5g-log-agent \
  --restart unless-stopped \
  --network open5gs-split-5gc \
  -e AGENT_ID=5g-log-agent-01 \
  -e NF_FILTER=open5gs \
  -e OUTPUT=kafka \
  -e KAFKA_BROKERS=kafka:9092 \
  -e KAFKA_TOPIC_PREFIX=5g.raw \
  -e WATERMARK_DB=/data/watermarks.db \
  -e LOG_LEVEL=DEBUG \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v 5gi-log-agent-data:/data \
  5gi-log-agent:latest
```

Check:

```bash
sudo docker logs -f 5g-log-agent
```

## 6. Install the RCA Ingester

```bash
cd ../rca-ingester

python3 -m venv .venv
source .venv/bin/activate

python3 -m pip install -r requirements.txt
python3 -m pip install lz4
```

If `s5/consumer/kafka.py` still uses:

```python
self._consumer.commit({tp: offset + 1})
```

apply the Kafka offset compatibility patch:

```bash
sed -i \
  's/from kafka.structs import TopicPartition  # type: ignore/from kafka.structs import OffsetAndMetadata, TopicPartition  # type: ignore/' \
  s5/consumer/kafka.py

sed -i \
  's/self._consumer.commit({tp: offset + 1})/self._consumer.commit({tp: OffsetAndMetadata(offset + 1, None)})/' \
  s5/consumer/kafka.py
```

## 7. Install the Demo UI

```bash
cd demo-ui

rm -rf node_modules
npm cache clean --force
npm install
```

Do not use `sudo npm install`, as it can create root-owned files in the npm cache or `node_modules`.

---

# Running

After installation, use the following startup sequence:

```text
1. Split Open5GS Core
2. Kafka + Kafka UI
3. RCA Log Agent
4. OCUDU gNB
5. OAI UE
6. RCA Ingester
7. Demo UI
```

## 1. Start Open5GS

```bash
cd ~/Desktop/5g-Core-Inspector/ocudu

sudo docker compose \
  -f docker/open5gs-split/docker-compose.yml \
  up -d \
  --no-build \
  --pull never \
  mongodb nrf scp udr udm ausf pcf nssf bsf amf upf smf
```

Do not remove MongoDB during normal startup because its volume contains subscriber state.

## 2. Start Kafka

```bash
sudo docker start 5gi-kafka
sudo docker start 5gi-kafka-ui
```

If Kafka is not connected to the core network:

```bash
sudo docker network connect \
  open5gs-split-5gc \
  5gi-kafka
```

Kafka UI:

```text
http://localhost:8080
```

## 3. Start the Log Agent

```bash
sudo docker start 5g-log-agent
```

Check:

```bash
sudo docker logs --tail 50 5g-log-agent
```

## 4. Start the OCUDU gNB

In a separate terminal:

```bash
cd ~/Desktop/5g-Core-Inspector/ocudu/build/apps/gnb

sudo ./gnb -c gnb_oai.yaml
```

The gNB should connect to the AMF at:

```text
10.53.1.2:38412
```

## 5. Start the OAI UE

In another terminal:

```bash
cd ~/Desktop/5g-Core-Inspector/openairinterface5g/cmake_targets/ran_build/build

sudo env LD_LIBRARY_PATH="$PWD" \
  ./nr-uesoftmodem -O ./oaiue_zmq.conf
```

## 6. Start the RCA Ingester

```bash
cd ~/Desktop/5g-Core-Inspector/rca-ingester

source .venv/bin/activate
```

Set the development run secret:

```bash
export S5_RUN_SECRET=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
```

Start the consumer:

```bash
python3 main.py consume \
  --config s5-ingester.properties \
  --services amf,smf,nrf,udm,ausf,pcf,udr,bsf,scp,nssf,upf
```

## 7. Start the Demo UI

```bash
cd ~/Desktop/5g-Core-Inspector/rca-ingester/demo-ui

npm run refresh:data
npm run dev
```

The terminal will display the local UI address, normally:

```text
http://localhost:5173
```

---

# Verification

Check Open5GS:

```bash
sudo docker ps | grep open5gs
```

Check Kafka:

```bash
sudo docker ps | grep 5gi-kafka
```

Check the log agent:

```bash
sudo docker ps | grep 5g-log-agent
sudo docker logs --tail 100 5g-log-agent
```

Check the subscriber:

```bash
sudo docker exec open5gs_mongodb \
  mongosh open5gs --quiet \
  --eval 'db.subscribers.find({}, {imsi:1, _id:0}).toArray()'
```

Kafka topics should include:

```text
5g.raw.amf
5g.raw.smf
5g.raw.nrf
5g.raw.ausf
5g.raw.udm
5g.raw.udr
5g.raw.pcf
5g.raw.nssf
5g.raw.bsf
5g.raw.scp
5g.raw.upf
```

For UE registration, inspect `5g.raw.amf` in Kafka UI for registration events such as `InitialUEMessage`.

---

# Shutdown

Stop the log agent and Kafka:

```bash
sudo docker stop 5g-log-agent
sudo docker stop 5gi-kafka-ui
sudo docker stop 5gi-kafka
```

Stop Open5GS:

```bash
cd ~/Desktop/5g-Core-Inspector/ocudu

sudo docker compose \
  -f docker/open5gs-split/docker-compose.yml \
  stop
```

Stop the gNB, UE, RCA Ingester, and UI using `Ctrl+C` in their respective terminals.

---

## Goal

The project aims to move beyond raw log viewing:

```text
Raw NF Logs
    ↓
Cross-NF Correlation
    ↓
UE / Procedure Timeline
    ↓
Incident Timeline
    ↓
Root-Cause Analysis
```

The current prototype uses deterministic/rule-based correlation, with AI/ML-assisted analysis planned as future work.
