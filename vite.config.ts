import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		deps: {
			neverBundle: ['rolldown', 'vite', 'vitest', 'vitest/browser'],
		},
		entry: {
			'core/index': './packages/core/src/index.ts',
			'protocol/index': './packages/protocol/src/index.ts',
			'serializer/index': './packages/serializer/src/index.ts',
			'compiler/index': './packages/compiler/src/index.ts',
			'runtime/dom-update': './packages/runtime/src/dom-update.ts',
			'runtime/event-only-resume': './packages/runtime/src/event-only-resume.ts',
			'runtime/event-resume': './packages/runtime/src/event-resume.ts',
			'runtime/index': './packages/runtime/src/index.ts',
			'runtime/render': './packages/runtime/src/render.ts',
			'runtime/render-to-string': './packages/runtime/src/render-to-string.ts',
			'runtime/resume': './packages/runtime/src/payload.ts',
			'bundler/rolldown': './packages/bundler/src/rolldown.ts',
			'bundler/vite': './packages/bundler/src/vite/index.ts',
			'arcade/index': './packages/arcade/src/index.ts',
			'arcade/rolldown': './packages/arcade/src/rolldown.ts',
			'arcade/runtime': './packages/arcade/src/runtime.ts',
			'arcade/runtime/dom-update': './packages/arcade/src/runtime/dom-update.ts',
			'arcade/runtime/event-only-resume':
				'./packages/arcade/src/runtime/event-only-resume.ts',
			'arcade/runtime/event-resume': './packages/arcade/src/runtime/event-resume.ts',
			'arcade/runtime/render': './packages/arcade/src/runtime/render.ts',
			'arcade/runtime/render-to-string': './packages/arcade/src/runtime/render-to-string.ts',
			'arcade/runtime/resume': './packages/arcade/src/runtime/resume.ts',
			'arcade/vite': './packages/arcade/src/vite.ts',
			'test-utils/index': './packages/test-utils/src/index.ts',
			'vitest-browser/index': './packages/vitest-browser/src/index.ts',
			'vitest-browser/vitest': './packages/vitest-browser/src/vitest.ts',
		},
		format: ['esm'],
		dts: true,
		clean: true,
	},
	test: {
		environment: 'node',
		include: ['packages/*/test/**/*.test.ts'],
	},
	lint: {
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		endOfLine: 'lf',
		singleQuote: true,
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
});
