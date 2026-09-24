import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const result = JSON.parse(readFileSync(`${root}.vercel/react-router-build-result.json`, "utf8"));
const bundles = Object.values(result.buildManifest.serverBundles);
if (bundles.length !== 1) throw new Error(`expected one server bundle, found ${bundles.length}`);

const child = spawn(`${root}node_modules/.bin/react-router-serve`, [bundles[0].file], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT ?? "4440" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
