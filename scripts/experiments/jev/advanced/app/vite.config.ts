import { defineConfig } from 'vite-plus';
import { markless } from '../../../../../packages/core/src/vite.ts';
import { router } from '../../../../../packages/router/src/vite/index.ts';
export default defineConfig({ plugins: [markless(), router()] });
