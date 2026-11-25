import { defineConfig } from "tsup";
// Bundle completo (incluidos los paquetes TypeScript del monorepo). Solo argon2 (binario nativo) queda externo.
export default defineConfig({
  entry: ["src/index.ts"], format: ["esm"], target: "node22", platform: "node", clean: true,
  noExternal: [/^(?!@node-rs\/).*/], external: ["@node-rs/argon2"], removeNodeProtocol: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
