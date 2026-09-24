import { execSync } from "node:child_process";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

function buildId(): string {
  if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: { __BENCHMARK_BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [reactRouter()],
});
