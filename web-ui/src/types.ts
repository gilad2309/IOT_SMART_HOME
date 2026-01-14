export type PipelineState = 'idle' | 'starting' | 'streaming' | 'error';
export type StreamState = 'idle' | 'connecting' | 'streaming' | 'error';
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
export type AlarmLevel = 'normal' | 'warning' | 'alarm';

export interface ProcessStatus {
  pid: number;
}

export interface StatusResponse {
  running: Record<string, ProcessStatus>;
  cloud?: {
    provider: 'dynamodb';
    status: 'on' | 'off' | 'error';
  };
  nativeMode?: boolean;
}
