import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

// Demos are the framework lab: the localhost-gated execution log stays on in
// normal builds so build+preview prints execution lines in the console.
// MARKLESS_CONSUMER_BUILD=1 rebuilds in the consumer posture ('never') for
// shipped-size walls (owner rulings 2026-07-12). MARKLESS_FIXTURE_NATIVE_PACKING=0 builds
// the unpacked comparison the budget tests measure beside the packed default.
const executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const);
const packing = process.env.MARKLESS_FIXTURE_NATIVE_PACKING !== '0';

export default defineConfig({
	plugins: [markless({ executionLog, packing }), router()],
});
