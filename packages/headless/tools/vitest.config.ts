import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: fileURLToPath(new URL('../../..', import.meta.url)),
	test: {
		include: [
			'packages/headless/icons/test/**/*.test.ts',
			'packages/headless/tools/test/**/*.test.ts',
		],
		typecheck: {
			enabled: true,
			include: ['packages/headless/tools/test/**/*.test-d.ts'],
			tsconfig: 'packages/headless/tools/test/tsconfig.json',
		},
	},
});
