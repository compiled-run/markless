// The browser project's DOM matchers ship untyped through vite-plus (its
// ./test/matchers entry has no types field), so the one matcher these suites
// use is declared here until upstream exports its augmentation.
import 'vitest';

declare module 'vitest' {
	interface Assertion<T = any> {
		toBeInTheDocument(): void;
	}
}
