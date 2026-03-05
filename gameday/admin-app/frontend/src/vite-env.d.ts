/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPLUNK_RUM_TOKEN: string | undefined;
  readonly VITE_SPLUNK_REALM: string | undefined;
  readonly VITE_APP_VERSION: string | undefined;
  readonly VITE_DEPLOYMENT_ENV: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
