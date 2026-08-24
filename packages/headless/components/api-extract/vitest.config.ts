import { defineProject } from 'vitest/config';

// The drift gate reads sources off disk and runs the compiler's type service,
// so it belongs to a node lane, not the package's browser project.
export default defineProject({
	test: {
		name: 'ui-api',
		environment: 'node',
		include: ['api-extract/**/*.test.ts'],
		root: new URL('..', import.meta.url).pathname,
	},
});
