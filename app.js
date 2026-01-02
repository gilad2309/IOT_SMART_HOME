
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectStreams() {
    const videoElement = document.getElementById('webrtc-video');
    const personOverlay = document.getElementById('person-overlay');
    if (!videoElement || !personOverlay) return;

    // The media server exposes different streams as "paths". We match the one from DeepStream.
    // The /whep endpoint is the standard for WebRTC HTTP Egress Protocol.
    // Use 127.0.0.1 to match the page host and avoid CORS (localhost vs 127.0.0.1 are different origins).
    const mediaServerUrl = 'http://127.0.0.1:8889/ds-test/whep'; 

    // MQTT (person count)
    const mqttUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + '127.0.0.1:9001';
    const mqttTopic = 'deepstream/person_count';
    try {
        const mqttClient = mqtt.connect(mqttUrl, {
            clientId: 'webclient-' + Math.random().toString(16).slice(2),
            keepalive: 30,
            reconnectPeriod: 2000,
            clean: true
        });
        mqttClient.on('connect', () => {
            console.log('MQTT connected to', mqttUrl);
            mqttClient.subscribe(mqttTopic);
        });
        mqttClient.on('close', () => console.warn('MQTT connection closed'));
        mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'person_count' && typeof data.count === 'number') {
                    console.log('MQTT person_count', data.count);
                    personOverlay.textContent = `Persons: ${data.count}`;
                }
            } catch (e) {
                console.error('Failed to parse MQTT message', e);
            }
        });
        mqttClient.on('error', (err) => console.error('MQTT error', err));
        mqttClient.on('reconnect', () => console.warn('MQTT reconnecting...'));
    } catch (e) {
        console.error('MQTT init failed:', e);
    }

    console.log('Connecting to media server to get WebRTC stream');
    const pc = new RTCPeerConnection();

    pc.ontrack = (event) => {
        console.log('Track received, attaching to video element.');
        videoElement.srcObject = event.streams[0];
    };

    // This tells the peer connection we only want to receive video.
    pc.addTransceiver('video', {'direction': 'recvonly'});
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send the offer to the media server.
    const res = await fetch(mediaServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' }, // The server expects SDP content type
        body: offer.sdp,
    });

    // The server replies with its own SDP answer.
    const answerSdp = await res.text();
    await pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: answerSdp}));
    console.log('WebRTC connection established');
}

let starting = false;

async function connectWithRetry(retries = 3, backoffMs = 2000) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            await connectStreams();
            return;
        } catch (err) {
            lastErr = err;
            console.warn(`Connect attempt ${i + 1} failed, retrying in ${backoffMs}ms`, err);
            await delay(backoffMs);
        }
    }
    throw lastErr;
}

async function startPipeline() {
    const startBtn = document.getElementById('start-btn');
    const statusLabel = document.getElementById('status');
    if (!startBtn || !statusLabel) return;
    if (starting) return;
    starting = true;
    startBtn.disabled = true;
    statusLabel.textContent = 'Starting services...';
    try {
        const res = await fetch('/api/start', { method: 'POST' });
        if (!res.ok) throw new Error(`Start failed: ${res.status}`);
        statusLabel.textContent = 'Services starting...';
        await delay(3000); // give MediaMTX/DeepStream a moment to come up
        await connectWithRetry(3, 2000);
        statusLabel.textContent = 'Streaming';
    } catch (err) {
        console.error('Start pipeline failed', err);
        statusLabel.textContent = 'Start failed. Check logs and retry.';
        alert('Failed to start pipeline. Check server logs or run services manually.');
        startBtn.disabled = false;
    } finally {
        starting = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', startPipeline);
    }
});
