import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';

// Demos are the framework lab: the localhost-gated execution log stays on in
// normal builds so build+preview prints execution lines in the console.
// MARKLESS_CONSUMER_BUILD=1 rebuilds in the consumer posture ('never') for
// shipped-size walls (owner rulings 2026-07-12).
const executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const);

export default defineConfig({
	plugins: [markless({ executionLog })],
});
