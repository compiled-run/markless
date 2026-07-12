import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';

// Witness-only instrumentation: the production demo config keeps the stripped default.
export default defineConfig({
	plugins: [markless({ executionLog: 'auto' })],
});
