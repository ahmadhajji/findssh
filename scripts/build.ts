import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/renderer", { recursive: true });
await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/main/index.cjs",
  external: ["electron", "ssh2"],
});
await build({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/main/preload.cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/renderer/index.tsx"],
  bundle: true,
  platform: "browser",
  target: "chrome140",
  format: "esm",
  outfile: "dist/renderer/index.js",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
await copyFile("src/renderer/index.html", "dist/renderer/index.html");
