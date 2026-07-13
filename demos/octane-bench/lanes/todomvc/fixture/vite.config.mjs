import { markless } from '@markless/bundler/vite';
import { defineConfig } from 'vite-plus';
export default defineConfig({ plugins: [markless({ executionLog: 'never' })], build: { minify: 'oxc', target: 'es2022' } });
