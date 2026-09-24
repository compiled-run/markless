/**
 * This is the base config for vite.
 * When building, the adapter config is used which loads this file and extends it.
 */
import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { execSync } from "node:child_process";
import pkg from "./package.json";

type PkgDep = Record<string, string>;
const { dependencies = {}, devDependencies = {} } = pkg as any as {
  dependencies: PkgDep;
  devDependencies: PkgDep;
  [key: string]: unknown;
};
errorOnDuplicatesPkgDeps(devDependencies, dependencies);

/**
 * Note that Vite normally starts from `index.html` but the qwikRouter plugin makes start at `src/entry.ssr.tsx` instead.
 */
export default defineConfig((): UserConfig => {
  return {
    plugins: [
      qwikRouter({ trailingSlash: false }),
      qwikVite({ entryStrategy: { type: "smart", manual: ROUTE_BUNDLES } }),
      tsconfigPaths({ root: "." }),
    ],
    define: {
      __BENCHMARK_BUILD_ID__: JSON.stringify(benchmarkBuildId()),
    },
    // This tells Vite which dependencies to pre-build in dev mode.
    optimizeDeps: {
      // Put problematic deps that break bundling here, mostly those with binaries.
      // For example ['better-sqlite3'] if you use that in server functions.
      exclude: [],
    },

    /**
     * This is an advanced setting. It improves the bundling of your server code. To use it, make sure you understand when your consumed packages are dependencies or dev dependencies. (otherwise things will break in production)
     */
    // ssr:
    //   command === "build" && mode === "production"
    //     ? {
    //         // All dev dependencies should be bundled in the server build
    //         noExternal: Object.keys(devDependencies),
    //         // Anything marked as a dependency will not be bundled
    //         // These should only be production binary deps (including deps of deps), CLI deps, and their module graph
    //         // If a dep-of-dep needs to be external, add it here
    //         // For example, if something uses `bcrypt` but you don't have it as a dep, you can write
    //         // external: [...Object.keys(dependencies), 'bcrypt']
    //         external: Object.keys(dependencies),
    //       }
    //     : undefined,

    server: {
      headers: {
        // Don't cache the server response in dev mode
        "Cache-Control": "public, max-age=0",
      },
    },
    preview: {
      headers: {
        // Do cache the server response in preview (non-adapter production build)
        "Cache-Control": "public, max-age=600",
      },
    },
  };
});

// Tuned variant: one bundle per route plus one for the shared chrome (docs: qwik.dev/docs/guides/bundle/).
// Keys are Qwik segment hashes; a changed hash only falls back to the smart default placement.
const ROUTE_BUNDLES = {
  ...bundle("overview", [
    "s_0swpunKAQeA", "s_aMjNBiOeMHI", "s_egr0khk06sU", "s_hTsT0ekga8E", "s_iXIqyDvXFqE",
    "s_I14ssvoxsts", "s_UeacBAr5kSs", "s_VQpwqwYRjXo", "s_ahiCV8DlETE", "s_fBQJSWlNMIE",
    "s_mn00nY0MAbs", "s_2sZ0RR28pGo", "s_IfZV6E27JEc", "s_Pxh0c2MhiWM", "s_irqSkcyZbeE",
  ]),
  ...bundle("records", [
    "s_29OZJ9UGTT0", "s_gfX9S05BXNI", "s_w6rFBXy3GK4", "s_nc3VpsV68ak", "s_hdhm7XiV78I",
    "s_70FZoFETqrA", "s_EUSgaP4OuW0", "s_6Ppmd8qFQ8M", "s_99ck0vaYKNM", "s_Ka5JtXEkMyI",
  ]),
  ...bundle("settings", [
    "s_ZH3OY7u5fSE", "s_SwtpcTNTLeE", "s_A0qaXFR8APs", "s_Df5rXaUSSIs", "s_R2LkXJ3LVnM",
  ]),
  ...bundle("chrome", [
    "s_gdm31zZRfoc", "s_7ncI74UXnaY", "s_8Qf20TXeDWk", "s_MsVI9XdHQc8", "s_TOsLW2d3BWI",
    "s_o0ik681wKKY",
  ]),
};

function bundle(bundleName: string, symbols: string[]): Record<string, string> {
  return symbols.reduce(
    (obj, key) => {
      obj[key.replace("s_", "")] = obj[key] = bundleName;
      return obj;
    },
    {} as Record<string, string>,
  );
}

// *** utils ***

function benchmarkBuildId(): string {
  if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Function to identify duplicate dependencies and throw an error
 * @param {Object} devDependencies - List of development dependencies
 * @param {Object} dependencies - List of production dependencies
 */
function errorOnDuplicatesPkgDeps(
  devDependencies: PkgDep,
  dependencies: PkgDep,
) {
  let msg = "";
  // Create an array 'duplicateDeps' by filtering devDependencies.
  // If a dependency also exists in dependencies, it is considered a duplicate.
  const duplicateDeps = Object.keys(devDependencies).filter(
    (dep) => dependencies[dep],
  );

  // include any known qwik packages
  const qwikPkg = Object.keys(dependencies).filter((value) =>
    /qwik/i.test(value),
  );

  // any errors for missing "qwik-router-config"
  // [PLUGIN_ERROR]: Invalid module "@qwik-router-config" is not a valid package
  msg = `Move qwik packages ${qwikPkg.join(", ")} to devDependencies`;

  if (qwikPkg.length > 0) {
    throw new Error(msg);
  }

  // Format the error message with the duplicates list.
  // The `join` function is used to represent the elements of the 'duplicateDeps' array as a comma-separated string.
  msg = `
    Warning: The dependency "${duplicateDeps.join(", ")}" is listed in both "devDependencies" and "dependencies".
    Please move the duplicated dependencies to "devDependencies" only and remove it from "dependencies"
  `;

  // Throw an error with the constructed message.
  if (duplicateDeps.length > 0) {
    throw new Error(msg);
  }
}
