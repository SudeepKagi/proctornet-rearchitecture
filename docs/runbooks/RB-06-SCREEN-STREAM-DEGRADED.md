# Runbook RB-06: Screen Stream Packet Loss, Bandwidth Throttling & Stream Recovery

## 1. Overview & Classification
- **Identifier**: `RB-06-SCREEN-STREAM-DEGRADED`
- **Subsystem**: Client Screen Capture & SFU Bandwidth Adaptation (Phase 28 WebRTC Media Pipeline)
- **Severity**: SEV-3 (Performance Degradation)
- **Target RTO**: $< 15\text{ seconds}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$

## 2. Triggering Conditions
- Candidate report or invigilator telemetry badge showing `[TECHNICAL]` red flag.
- mediasoup RTCP Receiver Reports indicating packet loss $> 15\%$ or round-trip time $> 400\text{ ms}$.
- Client browser WebRTC `iceconnectionstatechange` transitioning to `disconnected` or `failed`.

## 3. Architecture & Automated Defenses
- **Adaptive Bitrate & Frame Dropping**:
  - The client screen stream encoder adapts frame rate ($1 - 5\text{ fps}$) and resolution ($720\text{p} \to 480\text{p}$) dynamically upon network congestion.
- **Client-Side Screen AI Resilience (Phase 28)**:
  - Screen AI runs **locally** inside a Dedicated Web Worker (`screenInference.worker.js`).
  - Telemetry is emitted as lightweight JSON metadata packets over WebSocket rather than requiring cloud video compute.
- **STUN/TURN Fallback**:
  - If direct UDP to SFU is blocked or unstable, Coturn relay handles TURN/TLS over TCP port 443.

## 4. Triage & Operator Intervention
1. Identify affected candidate USN / attemptId in Invigilator console.
2. Inspect connection telemetry badge:
   - Verify if issue is network latency, packet loss, or client hardware saturation.
3. Send operator intervention from Invigilator panel:
   - Click `Request Stream Reset` or `Send Candidate Warning / Notice`.
4. Check Coturn relay server status:
   ```bash
   systemctl status coturn
   netstat -u -p -n | grep 3478
   ```

## 5. Verification
1. Verify stream health in candidate detail drawer:
   - FPS stabilizes at $1 - 5\text{ fps}$.
   - Packet loss drops $< 5\%$.
2. Confirm invigilator live tile updates without frozen frame.
