// LOCAL TYPECHECK SHIM — deliberately NOT shipped (same reason as vitest-browser.d.ts).
//
// Do NOT hand-declare more matchers here. The full jest-dom set already reaches the
// checker: vite-plus bundles @vitest/browser's own matchers.d.ts and jest-dom.d.ts, and
// its dist/@vitest/browser/context.d.ts pulls them in with `import {} from './matchers.js'`.
// Measured against the root tsconfig program, toHaveAttribute, toHaveFocus, toBeVisible,
// toHaveTextContent, toBeChecked and toBeDisabled all resolve, on both `expect(el)` and
// the retrying `await expect.element(locator)` form.
//
// What this file actually does is anchor `Assertion` as a declaration OWNED by module
// 'vitest'. The bundled matchers.d.ts builds the retrying assertion as
// `Promisify<Assertion<T>>` resolved in that module's scope; with no local `Assertion`
// there, the promisified side resolves to nothing and every retrying matcher disappears,
// while the plain `expect(el)` side keeps working. So the member below is an anchor, not
// an inventory — deleting it costs the whole retrying surface, and adding to it risks
// overloads that shadow the real jest-dom signatures.
import 'vitest';

declare module 'vitest' {
	interface Assertion<T = unknown> {
		toBeInTheDocument(): void;
	}
}
