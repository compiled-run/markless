import { markless } from '@markless/bundler/vite';
import { defineConfig } from 'vite-plus';

// Witness-only instrumentation; the fixture's production config remains stripped.
export default defineConfig({
	plugins: [markless({ executionLog: 'auto' })],
});
