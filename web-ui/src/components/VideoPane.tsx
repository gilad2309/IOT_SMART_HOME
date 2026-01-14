import { useEffect, useRef, useState } from 'preact/hooks';
import { getWhepUrl } from '../lib/config';
import { StreamState } from '../types';
import './VideoPane.css';

interface Props {
  active: boolean;
  personCount: number | null;
  onStatusChange?: (state: StreamState) => void;
}

export function VideoPane({ active, personCount, onStatusChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<StreamState>('idle');
  const [message, setMessage] = useState<string>('Waiting to start');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connecting = useRef<boolean>(false);
  const fallbackVideoSrc = '/camera.mp4';

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (!active) {
      teardown(pcRef);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      setStatus('idle');
      setMessage('Waiting to start');
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (connecting.current) return;
      connecting.current = true;
      try {
        setStatus('connecting');
        setMessage('Connecting…');
        await connectPeer(pcRef, videoRef, () => {
          if (reconnectTimer.current) return;
          setStatus('connecting');
          setMessage('Reconnecting…');
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            run();
          }, 1500);
        });
        if (!cancelled) {
          setStatus('streaming');
          setMessage('Live');
        }
      } catch (err: any) {
        console.error('WHEP connect failed', err);
        if (!cancelled) {
          setStatus('error');
          setMessage('Video connection failed');
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            run();
          }, 2000);
        }
      } finally {
        connecting.current = false;
      }
    };
    run();
    return () => {
      cancelled = true;
      teardown(pcRef);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [active]);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const showPlaceholder = status !== 'streaming';
  const handleFullscreen = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
    };
    const elem = frame as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (document.fullscreenElement === frame) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } else if (frame.requestFullscreen) {
      frame.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  };

  return (
    <div className="video-pane">
      <div className="video-frame" ref={frameRef}>
        <video ref={videoRef} autoPlay playsInline className={showPlaceholder ? 'hidden' : ''} />
        {showPlaceholder && (
          <div className="placeholder">
            <video
              className="placeholder-video"
              src={fallbackVideoSrc}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        )}
        <div className={`live-pill ${status === 'streaming' ? 'on' : ''}`}>
          <span className="dot" />
          {status === 'streaming' ? 'Live' : 'Standby'}
        </div>
        <div className="top-right-controls">
          <div className="count-pill">Persons: {personCount ?? 0}</div>
          <button
            type="button"
            className={`fullscreen-toggle ${isFullscreen ? 'exit' : ''}`}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          >
            <span className="fullscreen-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

async function connectPeer(
  pcRef: { current: RTCPeerConnection | null },
  videoRef: { current: HTMLVideoElement | null },
  scheduleReconnect: () => void
) {
  if (pcRef.current) {
    pcRef.current.close();
    pcRef.current = null;
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
  });
  pcRef.current = pc;

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'failed' || state === 'disconnected') {
      pc.close();
      pcRef.current = null;
      scheduleReconnect();
    }
  };

  pc.ontrack = (event) => {
    if (videoRef.current) {
      videoRef.current.srcObject = event.streams[0];
    }
  };

  pc.addTransceiver('video', { direction: 'recvonly' });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceComplete(pc);
  const localSdp = pc.localDescription?.sdp;
  if (!localSdp) {
    throw new Error('Missing local SDP');
  }

  const whepUrl = getWhepUrl();
  const res = await fetch(whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: localSdp
  });
  if (!res.ok) throw new Error(`WHEP error: ${res.status}`);

  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

function waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      reject(new Error('ICE gathering timeout'));
    }, 5000);
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

function teardown(pcRef: { current: RTCPeerConnection | null }) {
  if (pcRef && pcRef.current) {
    pcRef.current.close();
    pcRef.current = null;
  }
}
