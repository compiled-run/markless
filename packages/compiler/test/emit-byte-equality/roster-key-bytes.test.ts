import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { MARKLESS_ELEMENT_BOUND_KEY_PREFIX } from '../../src/passes/public-render/residue-reader.ts';

// What the instance-keyed roster key costs a page. The key is longer than the
// handle-only one it replaced, so the question is where those bytes land: the
// seed map is built per render and never serialised, so a served payload must
// not carry the key at all, and a page with no shared element() handle must not
// emit it anywhere.
const factories = `
import { element, shared, state } from '@markless/core';
export const barState = shared(() => { const bar = state({ label: '' }); const barEl = element(); return { ...bar, barEl }; }, { scope: 'widget' });
export const itemState = shared(() => { const item = state({ label: '' }); const itemEl = element(); const contentEl = element(); return { ...item, itemEl, contentEl }; }, { scope: 'widget' });
export function Bar({ children }) @{ const bar = barState(); <div el={bar.barEl} role="menu">{children}</div> }
export function Item({ label = '', children }) @{ const item = itemState(); item.label = label; <div el={item.itemEl} aria-controls={item.contentEl}>{children}</div> }
export function Content({ children }) @{ const item = itemState(); <div el={item.contentEl}>{children}</div> }
`;

const items = `<Item label="plain" /><Item label="nesting"><Content>open</Content></Item>`;

const pages: Record<string, string> = {
	'no-handles': `import { state } from '@markless/core'; export function Page() @{ let count = state(0); <button onClick={() => count++}>{count}</button> }`,
	'not-nested': `${factories}\nexport function Page() @{ <div>${items}</div> }`,
	nested: `${factories}\nexport function Page() @{ <Bar>${items}</Bar> }`,
};

const compiled = Object.fromEntries(
	await Promise.all(
		Object.entries(pages).map(async ([name, source]) => [
			name,
			await compileTsrxModule({
				filename: 'src/menu.tsrx',
				source,
				buildId: 'build',
				resolverId: 'resolver',
				symbols: [],
			}),
		]),
	),
) as Record<string, Awaited<ReturnType<typeof compileTsrxModule>>>;

test('no served payload carries a roster key', () => {
	for (const result of Object.values(compiled))
		for (const payload of [result.protocolState, result.protocolView, result.payloadScripts])
			expect(JSON.stringify(payload ?? null)).not.toContain(MARKLESS_ELEMENT_BOUND_KEY_PREFIX);
});

test('the browser render-data module carries no roster key', () => {
	// The key is built inside the compiled residue readers, which travel on the
	// component definitions; the render-data module itself is untouched by it.
	for (const result of Object.values(compiled))
		expect(result.publicRenderModule.renderDataModuleSource ?? '').not.toContain(
			MARKLESS_ELEMENT_BOUND_KEY_PREFIX,
		);
});

test('a page with no shared element handle emits no roster key at all', () => {
	const result = compiled['no-handles']!;
	expect(JSON.stringify(result)).not.toContain(MARKLESS_ELEMENT_BOUND_KEY_PREFIX);
});

test('nesting the family changes no served payload shape, only the seed pass', () => {
	// Both pages read the same shared IDREF, so both compile the same reader; the
	// enclosing widget only adds seed-pass filings, which are server-side.
	const notNested = compiled['not-nested']!.publicRenderModule;
	const nested = compiled['nested']!.publicRenderModule;
	const readers = (module: typeof notNested) =>
		(module.componentDefinitions as ReadonlyArray<Record<string, unknown>>).flatMap(
			(definition) =>
				typeof definition.residueReaderSource === 'string' &&
				definition.residueReaderSource.includes(MARKLESS_ELEMENT_BOUND_KEY_PREFIX)
					? [definition.residueReaderSource]
					: [],
		);

	expect(readers(notNested).length).toBeGreaterThan(0);
	expect(readers(nested)).toEqual(readers(notNested));
});
