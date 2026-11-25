import { defineConfig } from "tsup";
export default defineConfig({ entry: { cli: "src/cli.ts" }, format: ["esm"], platform: "node", target: "node22", clean: true, noExternal: [/.*/], removeNodeProtocol: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
