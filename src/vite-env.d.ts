/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOOP_LAB_ROOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
