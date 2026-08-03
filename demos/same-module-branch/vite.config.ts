import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';

export function sameModuleBranchConfig(
	executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const),
) {
	return {
		plugins: markless({ executionLog }),
	};
}

export default defineConfig(sameModuleBranchConfig());
