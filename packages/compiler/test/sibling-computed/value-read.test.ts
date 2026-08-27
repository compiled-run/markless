import { expect, test } from 'vitest';
import {
	callRefusals,
	clientDeriveModule,
	compileAll,
	compileOne,
	errors,
	servedDeriveLine,
} from './support.ts';

// The authored contract: `computed()` answers with the derived value, so a
// factory cell that composes a sibling reads the sibling's NAME. Both emitters
// have to turn that name into a read of the sibling's cell - the served module
// binds it as a local, the browser module reads it off the graph.

const CHAIN = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	const banged = computed(() => loud + '!');
	const asked = computed(() => banged + '?');
	return { ...s, loud, banged, asked };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.asked}</div>
}
`;

const NODE = (name: string) => `shared:src/family.tsrx#box/computed:${name}`;

test('the served module binds a sibling read as a local off the sibling cell', async () => {
	const compiled = await compileOne('src/family.tsrx', CHAIN);

	const banged = servedDeriveLine(compiled, NODE('banged'));
	expect(banged).toContain(`const loud=read(${JSON.stringify(NODE('loud'))},[])`);
	expect(banged).toContain(`const derive=() => loud + '!'`);

	const asked = servedDeriveLine(compiled, NODE('asked'));
	expect(asked).toContain(`const banged=read(${JSON.stringify(NODE('banged'))},[])`);
	expect(asked).toContain(`const derive=() => banged + '?'`);
});

test('the browser module reads the sibling cell in place of the name', async () => {
	const compiled = await compileOne('src/family.tsrx', CHAIN);

	expect(clientDeriveModule(compiled, NODE('banged'))).toContain(
		`context.graph.read(${JSON.stringify(NODE('loud'))}) + '!'`,
	);
	expect(clientDeriveModule(compiled, NODE('asked'))).toContain(
		`context.graph.read(${JSON.stringify(NODE('banged'))}) + '?'`,
	);
});

test('a chain of three composes without a refusal on either emitter', async () => {
	const compiled = await compileOne('src/family.tsrx', CHAIN);
	expect(errors(compiled)).toEqual([]);
});

test('the served derive order puts a sibling ahead of the cell that reads it', async () => {
	const compiled = await compileOne('src/family.tsrx', CHAIN);
	const served = compiled.publicRenderModule.ssrModuleSource ?? '';
	const at = (name: string) => served.indexOf(`RenderStateValues.set(${JSON.stringify(NODE(name))}`);
	expect(at('loud')).toBeGreaterThan(-1);
	expect(at('loud')).toBeLessThan(at('banged'));
	expect(at('banged')).toBeLessThan(at('asked'));
});

// The same structure with different names, a different element and a different
// operator: nothing in the lowering may key off the fixture's own spelling.
const ALTERNATE = `
import { shared, state, computed } from '@markless/core';

export const dial = shared(() => {
	const cell = state({ count: 2 });
	const doubled = computed(() => cell.count * 2);
	const capped = computed(() => Math.min(doubled, 6));
	return { ...cell, doubled, capped };
}, { scope: 'widget' });

export default function Dial() @{
	const d = dial();
	<span data-dial>{d.capped}</span>
}
`;

test('an alternate-shaped factory lowers the same way', async () => {
	const compiled = await compileOne('src/dial.tsrx', ALTERNATE);
	const doubled = 'shared:src/dial.tsrx#dial/computed:doubled';
	const capped = 'shared:src/dial.tsrx#dial/computed:capped';

	expect(errors(compiled)).toEqual([]);
	expect(servedDeriveLine(compiled, capped)).toContain(
		`const doubled=read(${JSON.stringify(doubled)},[])`,
	);
	expect(clientDeriveModule(compiled, capped)).toContain(
		`Math.min(context.graph.read(${JSON.stringify(doubled)}), 6)`,
	);
});

const CONSUMER = `
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<section data-page>{b.asked}</section>
}
`;

test('another module copying the chain gets the same reads and no refusal', async () => {
	const [, consumer] = await compileAll([
		{ filename: 'src/family.tsrx', source: CHAIN, importSource: './family.tsrx' },
		{ filename: 'src/consumer.tsrx', source: CONSUMER },
	]);

	expect(errors(consumer!)).toEqual([]);
	expect(callRefusals(consumer!)).toEqual([]);
	expect(servedDeriveLine(consumer!, NODE('asked'))).toContain(
		`const banged=read(${JSON.stringify(NODE('banged'))},[])`,
	);
	expect(clientDeriveModule(consumer!, NODE('asked'))).toContain(
		`context.graph.read(${JSON.stringify(NODE('banged'))}) + '?'`,
	);
});
