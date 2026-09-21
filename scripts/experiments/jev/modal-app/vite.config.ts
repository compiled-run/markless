import { defineConfig } from 'vite';
import { markless } from '../../../../packages/core/src/vite.ts';
import { fixtureSsrHost } from '../../../../packages/bundler/fixtures/vite-ssr/src/dev-server.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const coreRoot = resolve('packages/core');
const core = JSON.parse(readFileSync(resolve(coreRoot, 'package.json'), 'utf8'));
const alias = Object.entries(core.exports).filter(([, target]) => typeof target === 'string').map(([name, target]) => ({ find: new RegExp(`^${core.name}${name === '.' ? '' : name.slice(1)}$`), replacement: resolve(coreRoot, target as string) }));
export default defineConfig({
  resolve: { alias },
  plugins: [markless(), fixtureSsrHost({ devRenderEntry: '/server.ts' })],
});
