import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { SEED_CHILDREN_UNAVAILABLE_CODE } from '../../src/passes/public-render/seed-children-diagnostics.ts';

/**
 * What the seed reads out of a projection to carry its children's TEXT CONTENT,
 * measured on the compiled chunk rather than argued.
 *
 * Two facts carry it: a markup projection with no expression in it is fully
 * spelled in the chunk, and the statics it is spelled in are HTML-escaped — so
 * the text a reader hears is what the seed must be handed, not those bytes.
 */
const FAMILY = `import { shared, state } from '@markless/core';
export const meterState = shared(() => {
	const meter = state({ value: 0, ownLabel: '' });
	return { ...meter };
}, { scope: 'widget' });

function MeterRoot({ children }) @{
	const meter = meterState();

	<div>{children}</div>
}

function MeterBar({ value = 0 }) @{
	const meter = meterState();
	meter.value = value;

	<div role="progressbar" aria-valuenow={meter.value} aria-valuetext={meter.ownLabel}></div>
}

function MeterLabel({ children }) @{
	const meter = meterState();
	meter.ownLabel = children;

	<span>{children}</span>
}
`;

async function compilePage(children: string) {
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `${FAMILY}export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel>${children}</MeterLabel>
	</MeterRoot>
}`,
		symbols: [],
	});
}

async function projectionChunk(children: string) {
	const result = await compilePage(children);
	const chunk = result.renderData.chunks.find(
		(candidate) => candidate.id === 'projection:component-edge:2',
	);
	if (!chunk) throw new Error('Expected the label placement to carry a projection chunk.');
	return chunk;
}

test('markup with no expression in it is fully spelled in the projection chunk', async () => {
	const chunk = await projectionChunk('<em>50</em> of 100 rows');

	// No slot is what makes the HTML complete at compile time; the element only
	// costs a host entry, which carries no value of its own.
	expect(chunk.slots).toEqual([]);
	expect(chunk.hosts.map((host) => host.tagName)).toEqual(['em']);
	expect(chunk.statics.join('')).toBe('<em>50</em> of 100 rows');
});

test('an expression inside the markup leaves the projection with a slot to render', async () => {
	const chunk = await projectionChunk('<em>{30}</em> of 100 rows');

	expect(chunk.slots.map((slot) => slot.kind)).toEqual(['text']);
	expect(chunk.statics.join('')).toBe('<em><!--markless-slot:0--></em> of 100 rows');
});

test('a tag boundary is unambiguous: a > inside an attribute value is escaped', async () => {
	const chunk = await projectionChunk('<em title="a>b">50</em> rows');

	expect(chunk.statics.join('')).toBe('<em title="a&gt;b">50</em> rows');
});

/**
 * The statics are HTML, so authored text reaches them escaped. The seed carries
 * what the label shows, not those bytes — otherwise the sibling bar's
 * `aria-valuetext` says "&amp;" out loud where the label reads "&".
 */
test('the static-text seed carries the text the label shows, not the escaped bytes', async () => {
	const result = await compilePage('Tom & Jerry rows');
	const chunk = await projectionChunk('Tom & Jerry rows');

	expect(chunk.statics.join('')).toBe('Tom &amp; Jerry rows');
	expect(result.publicRenderModule.ssrModuleSource).toContain('children:"Tom & Jerry rows"');
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('Tom &amp; Jerry rows');
	expect(result.publicRenderModule.diagnostics).toEqual([]);
});

test('markup children seed their text content instead of being refused', async () => {
	const result = await compilePage('<em>50</em> of 100 rows');

	expect(result.publicRenderModule.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
		SEED_CHILDREN_UNAVAILABLE_CODE,
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain('children:"50 of 100 rows"');
});

test('an expression inside the markup is still refused: it has no value this early', async () => {
	const result = await compilePage('<em>{30}</em> of 100 rows');

	expect(result.publicRenderModule.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SEED_CHILDREN_UNAVAILABLE_CODE,
	);
});
