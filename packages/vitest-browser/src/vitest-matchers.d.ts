// LOCAL TYPECHECK SHIM — deliberately NOT shipped (same reason as vitest-browser.d.ts):
// the workspace's browser provider comes from vite-plus, whose ./test/matchers entry
// ships no types, so the DOM matcher augmentation never reaches 'vitest'. Consumers
// with a real provider get these from it; this covers every suite in this workspace.
import 'vitest';

declare module 'vitest' {
	interface Assertion<T = unknown> {
		toBeInTheDocument(): void;
	}
}
