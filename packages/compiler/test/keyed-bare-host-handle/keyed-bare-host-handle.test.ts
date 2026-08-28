import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * Where a widget family's plural element() handle binding is PLANNED, held
 * against the shape of the row that binds it.
 *
 * The handler read lowers the same way in all three shapes below, so the read
 * is not what diverges. What diverges is the binding: a bare host inside a
 * keyed repeat is planned only into that repeat's `rowElementHandles`, and
 * `view.elementHandles` — the roster the root's `getElementHandle` is answered
 * from — comes back empty. A row that is a component of the family plans onto
 * the component's own root instead and stays in `view.elementHandles`. The
 * browser consequence is
 * `packages/vitest-browser/browser/keyed-bare-host-handle/`.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Dial.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

function handleNames(handles: ReadonlyArray<{ readonly name: string }> | undefined) {
	return (handles ?? []).map((handle) => handle.name);
}

const FAMILY = `
import { computed, element, shared, state } from '@markless/core';
import { rosterOf } from './report.ts';

export const dial = shared(
	() => {
		const d = state({ tag: '', roster: '' });
		const markEls = element<HTMLLIElement[]>();
		const rows = computed(() => [d.tag + '1', d.tag + '2']);
		return { ...d, markEls, rows };
	},
	{ scope: 'widget' },
);
`;

const PROBE = `<button onClick={() => { d.roster = rosterOf(d.markEls); }}>probe</button>`;

const STATIC = `${FAMILY}
export function Dial() @{
	const d = dial();

	<div>
		${PROBE}
		<ul>
			<li el={d.markEls}>1</li>
			<li el={d.markEls}>2</li>
		</ul>
	</div>
}
`;

const KEYED_BARE = `${FAMILY}
export function Dial() @{
	const d = dial();

	<div>
		${PROBE}
		<ul>
			@for (const row of d.rows; key row) {
				<li el={d.markEls}>{row}</li>
			}
		</ul>
	</div>
}
`;

const KEYED_COMPONENT = `${FAMILY}
export function Mark({ value }) @{
	const d = dial();
	const row = state({ value });

	<li el={d.markEls}>{row.value}</li>
}

export function Dial() @{
	const d = dial();

	<div>
		${PROBE}
		<ul>
			@for (const row of d.rows; key row) {
				<Mark value={row} />
			}
		</ul>
	</div>
}
`;

test('every shape lowers the root handler read to the handle registry, so the read is not the divergence', async () => {
	for (const source of [STATIC, KEYED_BARE, KEYED_COMPONENT]) {
		const result = await compile(source);
		expect(result.semanticGraph.diagnostics).toEqual([]);
		expect(eventSymbolSources(result)).toEqual([
			expect.stringContaining(
				'context.getElementHandle("shared:src/Dial.tsrx#dial/element:markEls")',
			),
		]);
	}
});

test('a static bare host plans the binding into the instance handle roster', async () => {
	const result = await compile(STATIC);

	expect(handleNames(result.payloadArena.view.elementHandles)).toEqual(['markEls', 'markEls']);
	expect(result.payloadArena.view.keyedRepeats).toEqual([]);
});

test('a keyed row that is a component keeps the binding in the instance handle roster', async () => {
	const result = await compile(KEYED_COMPONENT);

	expect(handleNames(result.payloadArena.view.elementHandles)).toEqual(['markEls']);
	expect(result.payloadArena.view.keyedRepeats).toHaveLength(1);
	expect(result.payloadArena.view.keyedRepeats[0].rowElementHandles).toBeUndefined();
});

test('a keyed BARE host empties the instance handle roster and plans the binding row-side only', async () => {
	const result = await compile(KEYED_BARE);

	expect(result.payloadArena.view.elementHandles).toEqual([]);
	expect(result.payloadArena.view.keyedRepeats).toHaveLength(1);
	expect(handleNames(result.payloadArena.view.keyedRepeats[0].rowElementHandles)).toEqual([
		'markEls',
	]);
});
