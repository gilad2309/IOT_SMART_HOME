/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WHEP_URL?: string;
  readonly VITE_MQTT_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
