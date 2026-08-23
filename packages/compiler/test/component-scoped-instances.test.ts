import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * Defect 46. A shared-instance local was resolved by NAME against every instance
 * in the module, so a read inside one component reached a local declared only in
 * another whenever the two happened to be spelled alike - no loop and no repeat
 * involved. The last declaration won, which meant a part quietly seeded and read
 * a different widget's cell.
 *
 * The declaring component owns the name. A read resolves only through an
 * instance its own body declares, or through one declared at module scope, which
 * is what module scope means in plain JavaScript.
 *
 * The passes that collect the graph are accidentally safe here: they resolve
 * while walking, when the colliding declaration further down the file has not
 * been collected yet. Everything that runs on the FINISHED graph - the render
 * body, the residue preludes, the payload - is where the collision actually
 * lands, so that is what these tests pin.
 */

// Two different widget definitions, one part each. Only the spelling of the
// instance local varies between the colliding fixture and the control, so a
// normalised comparison sees structure and not names.
const moduleSource = (alphaLocal: string, betaLocal: string) => `
import { shared, state } from '@markless/core';

export const alpha = shared(() => {
	const cell = state({ label: 'alpha' });

	return { ...cell };
}, { scope: 'widget' });

export const beta = shared(() => {
	const cell = state({ label: 'beta' });

	return { ...cell };
}, { scope: 'widget' });

export function Alpha({ label }) @{
	const ${alphaLocal} = alpha();
	${alphaLocal}.label = label;

	<div data-alpha>alpha</div>
}

export default function Beta({ label }) @{
	const ${betaLocal} = beta();
	${betaLocal}.label = label;

	<div data-beta>beta</div>
}
`;

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/parts.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

type Compiled = Awaited<ReturnType<typeof compile>>;

// Every per-instance initial one component's body writes, as `component -> the
// graph node it lands in`. `s.label = label` is not a runtime write; it is the
// value this render gives that component's OWN instance, so the component and
// the node's owning definition must always be the same widget.
function seedRoutes(compiled: Compiled): Array<[unknown, unknown]> {
	return compiled.symbolResolver.symbols
		.filter((symbol) => symbol.kind === 'shared-seed')
		.map((symbol) => [symbol.componentName, symbol.graphNodeId]);
}

// The defect itself. `w.label = label` inside `Alpha` seeds ALPHA's cell. Before
// the fix the last instance spelled `w` answered for both parts, so `Alpha`
// emitted its seed into beta's node - one widget writing another widget's state,
// with nothing in the artifact to say so.
test('a component seeds the instance its own body declares', async () => {
	const compiled = await compile(moduleSource('w', 'w'));

	expect(seedRoutes(compiled)).toEqual([
		['Alpha', 'shared:src/parts.tsrx#alpha/state:cell'],
		['Beta', 'shared:src/parts.tsrx#beta/state:cell'],
	]);
});

// The nastier shape: the reading component declares NO local of that name and
// used to borrow another component's silently. It is placed AFTER the component
// that does declare it, because a name collected later cannot be found while the
// earlier component is still being walked - the accident that hides this.
test('a component that declares no such local borrows nobody else’s', async () => {
	const compiled = await compile(`
import { shared, state } from '@markless/core';

export const beta = shared(() => {
	const cell = state({ label: 'beta' });

	return { ...cell };
}, { scope: 'widget' });

export function Beta({ label }) @{
	const w = beta();
	w.label = label;

	<div data-beta>beta</div>
}

export default function Ghost({ label }) @{
	w.label = label;

	<div data-ghost>ghost</div>
}
`);

	// Beta's own seed stands - this is a scoping fix, not a disarmed resolver -
	// and Ghost contributes none, rather than one into beta's node.
	expect(seedRoutes(compiled)).toEqual([['Beta', 'shared:src/parts.tsrx#beta/state:cell']]);
});

// Byte-stability. Two parts spelling their instance locals alike is a spelling
// coincidence and nothing else, so the colliding module must compile to exactly
// the artifact the distinct-name module compiles to.
test('the colliding module compiles to the same artifact as a distinct-name module', async () => {
	const colliding = await compile(moduleSource('w', 'w'));
	const control = await compile(moduleSource('w', 'seat'));

	const shape = (compiled: Compiled, locals: ReadonlyArray<string>) =>
		[...new Set(locals)].reduce(
			// only the authored spelling of an instance local may differ
			(text, local) => text.replace(new RegExp(`\\b${local}\\b`, 'g'), 'LOCAL'),
			JSON.stringify({
				components: compiled.publicRenderModule.componentDefinitions,
				renderChunks: compiled.renderData.chunks,
				payload: compiled.payloadArena,
				// the emitted module text is where a resolution change would actually show
				ssr: compiled.publicRenderModule.ssrModuleSource,
			}),
		);

	expect(shape(colliding, ['w'])).toEqual(shape(control, ['w', 'seat']));
});

// The compile stays fully accepted: a resolution fix mints no new refusal.
test('the colliding module compiles with no diagnostic', async () => {
	const compiled = await compile(moduleSource('w', 'w'));

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(compiled.publicRenderModule.diagnostics ?? []).toEqual([]);
});
