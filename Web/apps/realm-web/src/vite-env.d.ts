/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLOCKNOTES_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
