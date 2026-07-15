import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		name: 'typescript-plugin-completion-matrix',
		environment: 'node',
		include: ['packages/typescript-plugin/test/completion-matrix.test.ts'],
	},
});
