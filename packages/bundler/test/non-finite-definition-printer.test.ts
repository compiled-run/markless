import { deserializeGraphValue, type SerializedGraphPayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { jsonSourceWithNonFiniteNumbers } from '../src/non-finite-json.ts';
import { transformTsrxModule } from '../src/transform.ts';

// The component definitions the browser lanes load are printed here, not by the
// compiler's render-data printer, and JSON prints every non-finite number as
// `null`. A folded `1e400` therefore reached the page as a silent wrong number
// on this path even after the compiler's own printer was taught the name.

// Three non-finite values that fold on the plain expression paths: a literal
// whose value overflows to Infinity, its negation, and a unary `+` over a string
// that is not a number.
const SEED_SOURCE = `
import { state } from '@markless/core';

export default function NfPage() @{
	const box = state({ cap: 1e400, floor: -1e400, missing: +'x', span: 3 });

	<main data-cap={box.cap} data-floor={box.floor} data-missing={box.missing} data-span={box.span} />
}
`;

const FINITE_SOURCE = `
import { state } from '@markless/core';

export default function FinitePage() @{
	const box = state({ cap: 640, label: 'frame' });

	<main data-cap={box.cap} data-label={box.label} />
}
`;

type PrerenderModule = {
	readonly marklessPrerenderData: {
		readonly components: Record<
			string,
			{
				readonly initialValues?: ReadonlyArray<{
					readonly graphNodeId: string;
					readonly value: { readonly kind: string; readonly value?: unknown };
				}>;
				readonly state: {
					readonly cells: ReadonlyArray<{
						readonly graphNodeId: string;
						readonly value: unknown;
					}>;
				};
			}
		>;
	};
};

async function renderDataSource(name: string, source: string): Promise<string> {
	const result = await transformTsrxModule({
		filename: `/workspace/app/src/${name}.tsrx`,
		source,
		environment: 'client',
	});
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');
	if (!renderData) throw new Error(`No render-data module for ${name}.`);
	return renderData.source;
}

/** Evaluate the emitted module the way the browser loads it. */
async function loadRenderDataModule(source: string): Promise<PrerenderModule> {
	return (await import(
		`data:text/javascript,${encodeURIComponent(source)}`
	)) as unknown as PrerenderModule;
}

test('the printer spells a non-finite number as the name the serializer gives it', () => {
	const source = jsonSourceWithNonFiniteNumbers({
		cap: Number.POSITIVE_INFINITY,
		floor: Number.NEGATIVE_INFINITY,
		missing: Number.NaN,
		span: 3,
	});

	expect(source).toBe('{"cap":Infinity,"floor":-Infinity,"missing":NaN,"span":3}');
	expect(JSON.parse(JSON.stringify({ cap: Number.POSITIVE_INFINITY }))).toEqual({ cap: null });
});

test('a payload with no non-finite number prints byte for byte as JSON', () => {
	const record = {
		name: 'NfPage',
		nested: { ok: [1, 2.5, -3], flag: true, missing: null, text: 'a "quoted" \\ tail\n' },
		empty: {},
	};

	expect(jsonSourceWithNonFiniteNumbers(record)).toBe(JSON.stringify(record));
});

// The marker the printer swaps in has to survive an authored string that spells
// it: the string stays a string and only the real number becomes a name.
test('an authored string spelling the marker is left as a string', () => {
	const marker = '\u0000markless-non-finite0';
	const source = jsonSourceWithNonFiniteNumbers({
		decoy: marker,
		cap: Number.POSITIVE_INFINITY,
	});

	expect(JSON.parse(source.replace('Infinity', '1e400')) as { decoy: string }).toEqual({
		decoy: marker,
		cap: Number.POSITIVE_INFINITY,
	});
	expect(source.endsWith('"cap":Infinity}')).toBe(true);
});

test('a folded non-finite seed reaches the loaded definition as the number it is', async () => {
	const source = await renderDataSource('nfSeed', SEED_SOURCE);
	expect(source).not.toContain('"cap":null');

	const loaded = await loadRenderDataModule(source);
	const definition = loaded.marklessPrerenderData.components.NfPage;
	if (!definition) throw new Error('No NfPage definition.');

	const initial = definition.initialValues?.find((entry) => entry.graphNodeId === 'state:box');
	expect(initial?.value.kind).toBe('constant');
	expect(initial?.value.value).toEqual({
		cap: Number.POSITIVE_INFINITY,
		floor: Number.NEGATIVE_INFINITY,
		missing: Number.NaN,
		span: 3,
	});

	// The serialized state cell beside it already carried the serializer's tag;
	// both halves of the payload must now agree on the same numbers.
	const cell = definition.state.cells.find((entry) => entry.graphNodeId === 'state:box');
	expect(deserializeGraphValue(cell?.value as SerializedGraphPayload)).toEqual(
		initial?.value.value,
	);
});

test('a module with no non-finite seed emits the definition JSON printed exactly as before', async () => {
	const source = await renderDataSource('finiteSeed', FINITE_SOURCE);
	const loaded = await loadRenderDataModule(source);
	const definition = loaded.marklessPrerenderData.components.FinitePage;
	if (!definition) throw new Error('No FinitePage definition.');

	const entries = source.slice(source.indexOf('const marklessPrerenderComponents = '));
	expect(entries).toContain(JSON.stringify(definition));
	expect(entries).not.toContain('Infinity');
	expect(entries).not.toContain('NaN');
});
