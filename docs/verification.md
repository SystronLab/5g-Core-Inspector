# Local verification — 9 September 2026

## Environment and successfully started components

- Split Open5GS: MongoDB plus AMF, SMF, UPF, AUSF, UDM, UDR, NRF, SCP, PCF, NSSF, BSF; existing images and networks reused. Subscriber initialization was already successful and was not repeated.
- Existing Kafka 3.7 KRaft broker and Kafka UI healthy/running; all eleven NF topics present, three partitions each. Consumer-group inspection verified all 33 subscribed partitions with total lag zero during the run.
- Existing RCA agent running and acknowledged Kafka production verified from its logs. Its Docker socket access and core-network broker connection work.
- New continuous ingester/API and standalone frontend started through the root startup script. Verified startup again against the existing running Compose projects.
- Existing OCUDU gNB and OAI UE binaries were run with their existing ZMQ configuration. The UE synchronized, completed registration and received a PDU Session Establishment Accept with IPv4 10.45.0.2. No radio or core source code was edited.

## End-to-end evidence

The dashboard/API reconstructed the actual subscriber `imsi-001010123456780`, including a previous registration at 14:36:26 UTC and the registration triggered during this work at 14:59:34 UTC. Ordered stages include Initial UE Message, registration request, authentication completion, Security Mode, registration acceptance and completion.

A real SIGINT-triggered OAI deregistration produced an AMF `Deregistration request` at 15:35:11.776 UTC and `De-registration accept` at 15:35:11.790 UTC. The initial browser check revealed that these legacy messages were not recognized by the parser. The parser/projection were corrected using these exact observed messages, with a regression test, and the real UE subsequently displayed `deregistered` / `inactive` in the API and browser.

A second registration/deregistration cycle was then tested with Chrome kept open on the UE list. The row changed from Registered to Deregistered through polling alone, without page reload or frontend restart. The dashboard retained three successful registration attempts and the corresponding real deregistration events. Search also persisted across live refreshes.

No test fixture was published to production Kafka or used as a UI fallback. Existing historical evidence was preserved. The dashboard's PDU state remained unknown before deregistration because the retained session evidence lacked a safe UE association; the code does not turn the UE softmodem's successful session output into an invented correlated NF result.

## Automated checks

- 18 backend unittest checks pass, including legacy envelope compatibility, durable commit behavior, checkpoint restoration, event ordering, registration acceptance vs completion, exact failure cause, incomplete observations, cross-NF identity associations, ambiguous reused IDs, flat peer-NF events, hex-dump filtering, deployed legacy deregistration, and companion-log deduplication.
- All seven replay scenarios pass: success, authentication failure, slice failure, missing subscriber, NRF discovery failure, SCP route failure and PDU session failure. Determinism, evidence integrity and tamper detection checks pass.
- Python compile checks pass. Optional pyflakes was not installed.
- Vite production build passes. Chrome/Playwright checks exercise all five navigation views plus UE detail, desktop/mobile layouts, and report no JavaScript page errors. Screenshots were inspected locally.
- Root shell scripts pass Bash syntax checks; the new agent Compose definition validates.

## Problems fixed and remaining limits

Fixed consumer idle termination, checkpoint persistence before Kafka commit, unsafe blanket offset commit on consumer close, missing live API, static-only UI data source, misplaced independent frontend, event ordering across partitions, false UE identities from hex dumps, flat peer-NF event parsing, legacy deregistration recognition, heartbeat-driven UE evidence eviction, and UI remounts during refresh.

The Kafka topic setup script's existing summary prints incorrect field positions for partition/replication counts; actual broker metadata was checked independently. The old standalone log-agent Compose copy still has stale host paths and is not used. Root orchestration uses the working core/Kafka Compose projects plus the new agent-only Compose definition.

The operator application is a local MVP with bounded in-memory projections, conservative identity associations and rule classifications. Missing signalling stages are not automatically diagnosed as failures. Internet reachability, correct correlation of every PDU session, and a real rejected registration were not independently demonstrated; failure presentation is covered by isolated tests. See `architecture.md` for precise retention and correlation limits.

Changes in the existing OCUDU configuration were present before this work; its tracked runtime log files also change naturally while the core is running. These are not Inspector source changes. Backend modifications reside inside the `rca-ingester` Git submodule and must be recorded there when committing.

## Final running state

The final `./scripts/start.sh --with-radio` run succeeded, including restarting the previously blocked ZMQ gNB before launching a fresh UE. At the final API check the pipeline reported `ok`, one registered UE and four successful registration attempts in retained real evidence. Core, Kafka, agent, API, frontend and both radio processes were left running. The latest checks include 18 passing backend tests.
