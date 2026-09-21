import { defineConfig } from 'vite-plus';
import { markless } from '../../../../packages/core/src/vite.ts';
import { fixtureSsrHost } from '../../../../packages/bundler/fixtures/vite-ssr/src/dev-server.ts';
export default defineConfig(({mode}) => ({ plugins: [markless(), fixtureSsrHost({devRenderEntry:mode==='modal-control'?'/modal-server.ts':'/todo-server.ts'})] }));
