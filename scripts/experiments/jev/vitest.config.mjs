import { defineConfig } from 'vitest/config';
import { markless } from '../../../packages/core/src/vite.ts';
import { testSSR } from '../../../packages/vitest-browser/src/ssr-plugin.ts';
import { playwright } from 'vite-plus/test/browser-playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createJev, choice } from './client.mjs';

let client;
const core = JSON.parse(readFileSync(resolve('packages/core/package.json'), 'utf8'));
const coreAliases = Object.entries(core.exports).filter(([, target]) => typeof target === 'string').map(([name, target]) => ({ find: new RegExp(`^${core.name}${name === '.' ? '' : name.slice(1)}$`), replacement: resolve('packages/core', target) }));
export default defineConfig({
  root: resolve('.'),
  plugins: [testSSR(), markless()],
  resolve: { alias: [...coreAliases, { find: '@markless/vitest-browser', replacement: resolve('packages/vitest-browser/src/index.ts') }] },
  server: { watch: null },
  define: { __JEV_REPLAY__: JSON.stringify(process.env.JEV_REPLAY === '1') },
  test: {
    include: ['scripts/experiments/jev/*.browser.js'],
    setupFiles: ['./packages/headless/components/test-support/browser-setup.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    expect: { poll: { timeout: 3000 } },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      commands: {
        async recordedPlan(_context, mode, policy, seed) {
          return JSON.parse(readFileSync(`/tmp/jev-experiments/headless/${mode}-${policy}-${seed}.json`, 'utf8'));
        },
        async jevDecision(_context, state, available, tag) {
          client ??= createJev();
          const response = await client.ask({ state, questions: { action: choice('Select a legal action to explore untested transitions in nested dialogs and expose focus, dismissal or background-interaction errors. Prefer meaningful new state/action combinations. Return one available action.', available) } }, tag);
          return response.answers.action;
        },
        async recordExperiment(_context, result) {
          const root = `/tmp/jev-experiments/headless${process.env.JEV_REPLAY === '1' ? '/replay' : ''}`;
          mkdirSync(root, { recursive: true });
          writeFileSync(`${root}/${result.mode}-${result.policy}-${result.seed}.json`, JSON.stringify(result, null, 2));
          return true;
        },
      },
    },
  },
});
