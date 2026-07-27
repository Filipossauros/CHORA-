/// <reference types="vite/client" />

/** Importação de recursos com `?url` (Vite) — ex.: o worker do pdf.js. */
declare module '*?url' {
  const url: string;
  export default url;
}
