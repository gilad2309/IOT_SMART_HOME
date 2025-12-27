
window.onload = async () => {
    const videoElement = document.getElementById('webrtc-video');
    // The media server exposes different streams as "paths". We match the one from DeepStream.
    // The /whep endpoint is the standard for WebRTC HTTP Egress Protocol.
    const mediaServerUrl = 'http://localhost:8889/ds-test/whep'; 

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
