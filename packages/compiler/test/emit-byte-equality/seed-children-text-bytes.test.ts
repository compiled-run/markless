import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// What decoding the seed's children costs a page. The seed prop is the only byte
// the decode can move, so a projection whose text carries none of the characters
// HTML escapes emits exactly what it emitted before; one that carries `&`, `<`,
// `>` or `"` moves, and that move is the fix - the escaped bytes were what the
// sibling's `aria-valuetext` read out loud.
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

async function compiled(children: string) {
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `${FAMILY}export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel>${children}</MeterLabel>
	</MeterRoot>
}`,
		symbols: [],
	});
	const chunk = result.renderData.chunks.find(
		(candidate) => candidate.id === 'projection:component-edge:2',
	);
	if (!chunk) throw new Error('Expected the label placement to carry a projection chunk.');
	return {
		statics: chunk.statics.join(''),
		seedProp: /const childProps=\{(children:[^}]*)\};await __marklessSsrComponent2/.exec(
			result.publicRenderModule.ssrModuleSource,
		)?.[1],
		diagnostics: result.publicRenderModule.diagnostics,
	};
}

test('text with nothing to escape emits the seed prop the chunk already spelled', async () => {
	const page = await compiled('30 of 100 rows');

	expect(page.statics).toBe('30 of 100 rows');
	expect(page.seedProp).toBe(`children:${JSON.stringify(page.statics)}`);
	expect(page.diagnostics).toEqual([]);
});

test('text carrying an escaped character moves, and moves only to what it renders as', async () => {
	const page = await compiled('Tom & Jerry rows');

	expect(page.statics).toBe('Tom &amp; Jerry rows');
	expect(page.seedProp).not.toBe(`children:${JSON.stringify(page.statics)}`);
	expect(page.seedProp).toBe('children:"Tom & Jerry rows"');
	expect(page.diagnostics).toEqual([]);
});

// One left-to-right pass. An entity the compiler's escaper does not produce is
// text, so it survives as the text the label shows - chaining the replacements
// would turn this into a non-breaking space the consumer never wrote.
test('an entity the escaper never produced stays the text the label shows', async () => {
	const page = await compiled('a &nbsp; b');

	expect(page.statics).toBe('a &amp;nbsp; b');
	expect(page.seedProp).toBe('children:"a &nbsp; b"');
	expect(page.diagnostics).toEqual([]);
});

test('markup and plain text spelling the same text content emit the same seed prop', async () => {
	const markup = await compiled('<em>30</em> of 100 rows');
	const text = await compiled('30 of 100 rows');

	expect(markup.statics).not.toBe(text.statics);
	expect(markup.seedProp).toBe(text.seedProp);
	expect(markup.diagnostics).toEqual([]);
});
