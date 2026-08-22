/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL for the HTTP API, e.g. http://localhost:3000. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
