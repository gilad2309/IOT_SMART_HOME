
window.onload = async () => {
    const videoElement = document.getElementById('webrtc-video');
    const personOverlay = document.getElementById('person-overlay');
    // The media server exposes different streams as "paths". We match the one from DeepStream.
    // The /whep endpoint is the standard for WebRTC HTTP Egress Protocol.
    const mediaServerUrl = 'http://localhost:8889/ds-test/whep'; 

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

    try {
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

    } catch (err) {
        console.error('Failed to connect to WebRTC stream:', err);
        alert('Failed to connect to video stream. Make sure the media server and DeepStream app are running.');
    }
};
