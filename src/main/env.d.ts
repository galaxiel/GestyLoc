/// <reference types="electron-vite/node" />

// Déclare les imports "?raw" (Vite) utilisés par le runner de migrations.
declare module '*.sql?raw' {
  const content: string
  export default content
}

// Sécurité : déclare aussi les imports .sql bruts (au cas où).
declare module '*.sql' {
  const content: string
  export default content
}
