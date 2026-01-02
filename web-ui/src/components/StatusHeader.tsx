import { ConnectionState, PipelineState, StreamState } from '../types';
import './StatusHeader.css';

interface Props {
  pipelineState: PipelineState;
  videoState: StreamState;
  mqttState: ConnectionState;
  host: string;
  lastUpdated?: Date | null;
}

const stateCopy: Record<PipelineState, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  streaming: 'Streaming',
  error: 'Error'
};

export function StatusHeader({ pipelineState, videoState, mqttState, host, lastUpdated }: Props) {
  return (
    <header className="status-header">
      <div>
        <div className="eyebrow">DeepStream Control</div>
        <h1>RTSP → WebRTC</h1>
      </div>
      <div className="status-badges">
        <span className="badge">
          <span className={`dot ${pipelineState}`} />
          {stateCopy[pipelineState]}
        </span>
        <span className="badge secondary">Video: {videoCopy(videoState)}</span>
        <span className="badge secondary">MQTT: {mqttCopy(mqttState)}</span>
        <span className="badge tertiary">Host: {host}</span>
        {lastUpdated && (
          <span className="badge tertiary">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
}

function videoCopy(state: StreamState) {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'streaming':
      return 'streaming';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

function mqttCopy(state: ConnectionState) {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'error':
      return 'error';
    default:
      return '';
  }
}
