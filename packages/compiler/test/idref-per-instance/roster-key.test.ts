import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import {
	MARKLESS_ELEMENT_BOUND_KEY_PREFIX,
	MARKLESS_WIDGET_INSTANCE_KEY,
} from '../../src/passes/public-render/residue-reader.ts';

// The menu shape: an outer family rooted by `Bar`, an inner family rooted by
// every `Item`, and `Content` written inside the one item that opens it. The
// enclosing widget's seed walk descends THROUGH the nested root and files the
// inner family's `contentEl` onto its own map, which every nested instance then
// inherits. Keyed by the instance token, that inherited entry names another
// widget, so a plain item still reads "unbound" and writes no IDREF.
const source = `
import { element, shared, state } from '@markless/core';

export const barState = shared(
	() => {
		const bar = state({ label: '' });
		const barEl = element();
		return { ...bar, barEl };
	},
	{ scope: 'widget' },
);

export const itemState = shared(
	() => {
		const item = state({ label: '' });
		const itemEl = element();
		const contentEl = element();
		return { ...item, itemEl, contentEl };
	},
	{ scope: 'widget' },
);

export function Bar({ children }) @{
	const bar = barState();
	<div el={bar.barEl} role="menu">{children}</div>
}

export function Item({ label = '', children }) @{
	const item = itemState();
	item.label = label;
	<div el={item.itemEl} aria-controls={item.contentEl}>{children}</div>
}

export function Content({ children }) @{
	const item = itemState();
	<div el={item.contentEl}>{children}</div>
}

export function Page() @{
	<Bar><Item label="plain" /><Item label="nesting"><Content>open</Content></Item></Bar>
}
`;

const compiled = await compileTsrxModule({
	filename: 'src/menu.tsrx',
	source,
	buildId: 'build',
	resolverId: 'resolver',
	symbols: [],
});

const ssrSource = compiled.publicRenderModule.ssrModuleSource ?? '';
const boundKey = JSON.stringify(MARKLESS_ELEMENT_BOUND_KEY_PREFIX);
const instanceKey = JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY);

/** The browser residue readers this module compiled, one per component. */
function clientReaderSources(): string[] {
	const definitions = compiled.publicRenderModule.componentDefinitions as ReadonlyArray<
		Record<string, unknown>
	>;
	return definitions.flatMap((definition) =>
		typeof definition.residueReaderSource === 'string' ? [definition.residueReaderSource] : [],
	);
}

function count(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

/** The per-family token read: the handle's own definition id, then the plain key. */
function tokenRead(get: string, handle: string): string {
	return `(${get}(${instanceKey}+'|'+${handle}.slice(0,${handle}.lastIndexOf('/')))??${get}(${instanceKey}))`;
}

/** One whole roster key: the prefix, that token, the separator, the handle. */
function rosterKey(get: string, handle: string): string {
	return `${boundKey}+${tokenRead(get, handle)}+'|'+${handle}`;
}

const filing = `${rosterKey('marklessSsrSeeds.get', 'marklessSsrHandle')},true);`;
const servedRead = rosterKey('marklessSsrRenderStateValues.get', 'residue.handleGraphNodeId');

test('the served seed pass files every roster entry under a widget-instance token', () => {
	expect(count(ssrSource, filing)).toBeGreaterThan(0);
	expect(count(ssrSource, filing)).toBe(count(ssrSource, 'for(const marklessSsrHandle of '));
});

test('the served reader asks for the key the served seed pass files', () => {
	expect(count(ssrSource, servedRead)).toBeGreaterThan(0);
	// Nothing in the served module spells the key any other way.
	expect(count(ssrSource, `${boundKey}+`)).toBe(
		count(ssrSource, filing) + count(ssrSource, servedRead),
	);
});

test('the browser reader asks for the same key, handle by handle', () => {
	const readers = clientReaderSources().filter((text) => text.includes(boundKey));
	expect(readers.length).toBeGreaterThan(0);

	// The handle expression differs between the single and the list form; the
	// prefix, the token read and the separator do not.
	for (const reader of readers) {
		const single = rosterKey('marklessResidueContext.read', 'residue.handleGraphNodeId');
		const list = rosterKey('marklessResidueContext.read', 'h');
		expect(count(reader, single)).toBeGreaterThan(0);
		expect(count(reader, `${boundKey}+`)).toBe(count(reader, single) + count(reader, list));
	}
});

test('the omission read takes the token without the mint refusal', () => {
	// A part that resolved no instance omits the IDREF rather than throwing; the
	// mint, which cannot write `id="undefined"`, still refuses loudly.
	expect(servedRead).not.toContain('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING');
	expect(ssrSource).toContain('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING');
});
