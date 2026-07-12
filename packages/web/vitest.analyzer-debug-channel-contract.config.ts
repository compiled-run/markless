import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/analyzer-debug-channel-contract.test-d.ts'],
		typecheck: {
			enabled: true,
			only: true,
			tsconfig: 'packages/web/test/tsconfig.analyzer-debug-channel-contract.json',
		},
	},
});
