import { createServer } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const kind = process.argv.includes('--modal') ? 'modal' : process.argv.includes('--counter') ? 'counter' : 'music';
const root = resolve(kind === 'modal' ? 'scripts/experiments/jev/modal-app' : kind === 'counter' ? 'packages/bundler/fixtures/vite-ssr' : 'demos/music-player-ssr');
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  mode: kind === 'counter' ? 'ssr' : 'development',
  server: { host: '127.0.0.1', port: kind === 'modal' ? 4390 : kind === 'counter' ? 4389 : 0, strictPort: true, watch: null },
});
await server.listen();
server.printUrls();
writeFileSync(`/tmp/jev-experiments/${kind === 'music' ? '' : `${kind}-`}server.json`, JSON.stringify({ url: server.resolvedUrls.local[0], pid: process.pid }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
