import { expect, test } from 'vitest';

/**
 * A `computed()` body that reads an element() handle is refused at compile time.
 *
 * It used to compile and then read `undefined` on every derivation - CSR and SSR
 * resume alike - because a handle read is rewritten into a DOM lookup only for
 * handler-shaped symbols, and a derive body is not one. Handles are bound on the
 * DOM, not in the graph, so no derivation can ever observe one; the refusal says
 * that instead of letting the nine letters of `undefined` reach the page.
 *
 * Compile refusal is the same on both paths, so each fixture shape is one row
 * rather than a CSR/SSR pair. The handler reads in these same fixtures stay
 * legal - `packages/compiler/test/element-handle-derive/` pins that.
 */

const CODE = 'MARKLESS_ELEMENT_HANDLE_UNBOUND';
const RULING = 'element() handles are DOM-bound and readable only in event handlers';

async function refusal(specifier: string) {
	const response = await fetch(new URL(specifier, import.meta.url));
	return { status: response.status, body: await response.text() };
}

test('a singular handle read in a part computed is refused', async () => {
	const { status, body } = await refusal('./single.tsrx?import');

	expect(status).toBe(500);
	expect(body).toContain(CODE);
	expect(body).toContain(RULING);
	expect(body).toContain('boxEl');
	expect(body).toContain('SingleRoot');
});

test('a plural handle read in a part computed is refused', async () => {
	const { status, body } = await refusal('./plural.tsrx?import');

	expect(status).toBe(500);
	expect(body).toContain(CODE);
	expect(body).toContain(RULING);
	expect(body).toContain('itemEls');
	expect(body).toContain('PluralRoot');
});

test('a handle read in a shared factory computed is refused and names the factory', async () => {
	const { status, body } = await refusal('./factory.tsrx?import');

	expect(status).toBe(500);
	expect(body).toContain(CODE);
	expect(body).toContain(RULING);
	expect(body).toContain('itemEls');
	expect(body).toContain('factory');
});

test('a computed measuring a handle is refused instead of publishing undefined', async () => {
	const { status, body } = await refusal('./width.tsrx?import');

	expect(status).toBe(500);
	expect(body).toContain(CODE);
	expect(body).toContain(RULING);
	expect(body).toContain('trackEl');
	expect(body).toContain('WidthRoot');
});
