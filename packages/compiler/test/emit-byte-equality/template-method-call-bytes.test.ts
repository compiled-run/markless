import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * What lifting method calls in template positions costs a page. The refusal it
 * replaced was written to save bytes, so the ceiling it owed is pinned here:
 * a page with no method-call read pays nothing, a call that only reads props
 * pays nothing, and each newly reactive call pays one computed record, one
 * update record and one derive module - and no more.
 *
 * Measured on this tree: payload JSON plus derive-module source grew 1,366 B raw
 * (964 B payload, 402 B derive module) and 125 B gzip for the second reactive
 * call, then 1,346 B raw and 98 B gzip for the third - gzip falls because the
 * records repeat. The ceilings below are those numbers with headroom; walk DOWN.
 * Read these as marginal cost per read, not per page: the first call in a page
 * is compared against a page that spends the same span on a property read.
 */
const page = (body: string) => `import { shared, state } from '@markless/core';

export const boardState = shared(() => {
	const board = state({ label: 'ready', items: ['a', 'b'] });
	return { ...board };
}, { scope: 'widget' });

export function Panel() @{
	const board = boardState();

	<section>${body}</section>
}
`;

const CALL = "<p>{board.items.join('|')}</p>";
const SECOND_CALL = '<p>{board.label.toUpperCase()}</p>';
const THIRD_CALL = '<p>{board.items.slice(1)}</p>';

const sources: Record<string, string> = {
	'no-call': page('<p>{board.items.length}</p><p>{board.label}</p>'),
	'one-call': page(CALL),
	'two-calls': page(CALL + SECOND_CALL),
	'three-calls': page(CALL + SECOND_CALL + THIRD_CALL),
	// A prop is settled by the render that produced it, so a call reading only
	// props is the one call shape that must stay free.
	'props-only-call': `
function Card({ formatter }: { formatter: { format(value: number): string } }) @{
	<p data-out={formatter.format(1)}>{formatter.format(2)}</p>
}

export function App() @{
	<Card formatter={{ format: (value: number) => String(value) }} />
}
`,
};

const compiled = Object.fromEntries(
	await Promise.all(
		Object.entries(sources).map(async ([name, source]) => [
			name,
			await compileTsrxModule({
				filename: 'src/Panel.tsrx',
				source,
				buildId: 'build',
				resolverId: 'resolver',
				symbols: [],
			}),
		]),
	),
) as Record<string, Awaited<ReturnType<typeof compileTsrxModule>>>;

type Compiled = (typeof compiled)[string];

function mintedComputeds(result: Compiled) {
	return result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
}

/** Payload JSON plus the derive modules it names: what a lifted call actually ships. */
function shippedBytes(result: Compiled) {
	const payload = JSON.stringify(result.payloadScripts ?? null);
	const modules = result.symbolModules.modules.map((module) => module.source).join('');
	return { raw: payload.length + modules.length, gzip: gzipSync(payload + modules).length };
}

test('a page with no method-call template read carries no lifted computed at all', () => {
	const result = compiled['no-call']!;

	expect(mintedComputeds(result)).toEqual([]);
	expect(JSON.stringify(result.payloadScripts ?? null)).not.toContain('templateExpression');
});

test('a call reading only props carries no lifted computed at all', () => {
	const result = compiled['props-only-call']!;

	expect(mintedComputeds(result)).toEqual([]);
	expect(JSON.stringify(result.payloadScripts ?? null)).not.toContain('templateExpression');
});

test('each lifted call buys exactly one computed and one update record', () => {
	for (const [name, expected] of [
		['one-call', 1],
		['two-calls', 2],
		['three-calls', 3],
	] as const) {
		const result = compiled[name]!;
		const minted = mintedComputeds(result);

		expect(minted, name).toHaveLength(expected);
		for (const computed of minted) {
			expect(
				result.payloadArena.view.domUpdates.filter(
					(update) => update.graphNodeId === computed.id,
				),
				`${name}: ${computed.id}`,
			).toHaveLength(1);
		}
	}
});

test('one more lifted call costs one more record set and nothing else', () => {
	const one = shippedBytes(compiled['one-call']!);
	const two = shippedBytes(compiled['two-calls']!);
	const three = shippedBytes(compiled['three-calls']!);

	const rawMarginals = [two.raw - one.raw, three.raw - two.raw];
	const gzipMarginals = [two.gzip - one.gzip, three.gzip - two.gzip];

	const report = `raw ${one.raw}/${two.raw}/${three.raw}, gzip ${one.gzip}/${two.gzip}/${three.gzip}`;
	for (const marginal of rawMarginals) expect(marginal, report).toBeLessThanOrEqual(1_500);
	for (const marginal of gzipMarginals) expect(marginal, report).toBeLessThanOrEqual(160);
	// Linear, not compounding: the third call must not cost more than the second.
	expect(rawMarginals[1], report).toBeLessThanOrEqual(rawMarginals[0]!);
	expect(gzipMarginals[1], report).toBeLessThanOrEqual(gzipMarginals[0]!);
});
