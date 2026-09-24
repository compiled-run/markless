import { execSync } from "node:child_process";
import solid from "@solidjs/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

function buildId(): string {
  if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
  try {
    return execSync("git rev-parse --short HEAD", { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: { __BENCHMARK_BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [
    solid({ start: { middleware: "./src/middleware.ts" }, ssr: true, extensions: [".jsx", ".tsx"] }),
    nitro({ serverEntry: false, vercel: { functions: { runtime: "nodejs24.x", regions: ["iad1"] } } }),
    fileRoutes({ httpMethods: true, types: true }),
  ],
  build: { target: "esnext" },
});
