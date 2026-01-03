const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8443 });

const peers = new Map();

console.log('Signaling server running on port 8443');

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.error('Failed to parse message:', message);
            return;
        }

        switch (msg.type) {
            case 'SUBSCRIBE':
                console.log(`Peer subscribed with ID: ${msg.peer_id}`);
                peers.set(msg.peer_id, ws);
                ws.peer_id = msg.peer_id;
                ws.send(JSON.stringify({ type: 'SUBSCRIBED', peer_id: msg.peer_id }));
                break;

            case 'SDP_OFFER':
                console.log(`Forwarding SDP offer from ${ws.peer_id} to DeepStream`);
                const ds_peer = peers.get('deepstream');
                if (ds_peer && ds_peer.readyState === WebSocket.OPEN) {
                    ds_peer.send(JSON.stringify({ ...msg, peer_id: ws.peer_id }));
                } else {
                    console.error('DeepStream peer not found or not open');
                }
                break;
            
            case 'SDP_ANSWER':
                console.log(`Forwarding SDP answer from DeepStream to ${msg.peer_id}`);
                const web_client = peers.get(msg.peer_id);
                if (web_client && web_client.readyState === WebSocket.OPEN) {
                    web_client.send(JSON.stringify(msg));
                } else {
                    console.error(`Web client ${msg.peer_id} not found or not open`);
                }
                break;

            case 'ICE_CANDIDATE':
                const target_peer_id = (ws.peer_id === 'deepstream') ? msg.peer_id : 'deepstream';
                console.log(`Forwarding ICE candidate from ${ws.peer_id} to ${target_peer_id}`);
                const target_peer = peers.get(target_peer_id);
                 if (target_peer && target_peer.readyState === WebSocket.OPEN) {
                    target_peer.send(JSON.stringify({ ...msg, peer_id: ws.peer_id }));
                } else {
                    console.error(`ICE target peer ${target_peer_id} not found or not open`);
                }
                break;

            default:
                console.warn('Unknown message type:', msg.type);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${ws.peer_id}`);
        if (ws.peer_id) {
            peers.delete(ws.peer_id);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});
