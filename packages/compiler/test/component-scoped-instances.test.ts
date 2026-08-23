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

// A second pair, exercising what the seed fixture cannot reach: each part
// RENDERS its instance's cell and binds an `el=` handle that only its OWN
// factory declares. The two factories name their handles differently on
// purpose - a borrowed instance then has no such property at all, so the
// borrowing shows up as a refusal rather than as a silent swap.
const renderingModuleSource = (alphaLocal: string, betaLocal: string) => `
import { shared, state, element } from '@markless/core';

export const alpha = shared(() => {
	const cell = state({ label: 'alpha' });
	const markEl = element();

	return { ...cell, markEl };
}, { scope: 'widget' });

export const beta = shared(() => {
	const cell = state({ label: 'beta' });
	const spotEl = element();

	return { ...cell, spotEl };
}, { scope: 'widget' });

export function Alpha({ label }) @{
	const ${alphaLocal} = alpha();
	${alphaLocal}.label = label;

	<div data-alpha el={${alphaLocal}.markEl}>{${alphaLocal}.label}</div>
}

export default function Beta({ label }) @{
	const ${betaLocal} = beta();
	${betaLocal}.label = label;

	<div data-beta el={${betaLocal}.spotEl}>{${betaLocal}.label}</div>
}
`;

// Every graph node a markup chunk's slots read, as `chunk -> node`. This is what
// the served template actually renders, so a wrong node here is a part painting
// another widget's value on screen.
function markupReads(compiled: Compiled): Array<[unknown, unknown]> {
	return compiled.semanticGraph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			const residue = (
				slot as {
					readonly residue?: { readonly kind: string; readonly graphNodeId?: string };
				}
			).residue;
			return residue?.kind === 'graph-read'
				? [[chunk.id, residue.graphNodeId] as [unknown, unknown]]
				: [];
		}),
	);
}

// The markup residue: THE proven leak. `template:Alpha` used to resolve
// `{w.label}` against every instance in the module, and the last `w` in the file
// won, so Alpha's rendered text came out of beta's cell.
test('each part renders the cell its own factory declared', async () => {
	const compiled = await compile(renderingModuleSource('w', 'w'));

	expect(markupReads(compiled)).toEqual([
		['template:Alpha', 'shared:src/parts.tsrx#alpha/state:cell'],
		['template:Beta', 'shared:src/parts.tsrx#beta/state:cell'],
	]);
});

// State lowering resolves on the FINISHED graph, so the collision lands there
// too: both parts' `w.label = label` lowered into beta's node, which is one
// widget's render writing another widget's cell.
test('each part lowers its seed write into its own widget cell', async () => {
	const compiled = await compile(renderingModuleSource('w', 'w'));

	// document order: Alpha's write, then Beta's
	expect(compiled.stateLowering.writes.map((write) => write.graphNodeId)).toEqual([
		'shared:src/parts.tsrx#alpha/state:cell',
		'shared:src/parts.tsrx#beta/state:cell',
	]);
});

// The element-handle route fails CLOSED, which makes the same collision a
// refusal rather than a swap: `el={w.markEl}` inside Alpha resolved `w` to
// beta's instance, beta declares no `markEl`, and a compile that should be
// accepted was rejected with MARKLESS_ELEMENT_HANDLE_REQUIRED.
test('each part binds the el handle its own factory declared', async () => {
	const compiled = await compile(renderingModuleSource('w', 'w'));

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
});

// Byte-stability for the rendering pair, the same way the seed pair is pinned.
test('the colliding rendering module compiles to the same artifact as a distinct-name module', async () => {
	const colliding = await compile(renderingModuleSource('w', 'w'));
	const control = await compile(renderingModuleSource('w', 'seat'));

	const shape = (compiled: Compiled, locals: ReadonlyArray<string>) =>
		[...new Set(locals)].reduce(
			(text, local) => text.replace(new RegExp(`\\b${local}\\b`, 'g'), 'LOCAL'),
			JSON.stringify({
				components: compiled.publicRenderModule.componentDefinitions,
				renderChunks: compiled.renderData.chunks,
				payload: compiled.payloadArena,
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

// A third pair, for the two positions the seed and el-handle fixtures cannot
// reach: a BRANCH CONDITION over the instance (`@if (LOCAL.open)`) and a
// TEMPLATE READ of it (`{LOCAL.label}`) lowered on the finished graph. Both
// factories declare the same property names on purpose - a borrowed instance
// then resolves to something that exists, so the collision is a silent swap
// rather than a refusal, which is exactly the shape that ships broken.
const branchingModuleSource = (alphaLocal: string, betaLocal: string) => `
import { shared, state } from '@markless/core';

export const alpha = shared(() => {
	const cell = state({ label: 'alpha', open: true });

	return { ...cell };
}, { scope: 'widget' });

export const beta = shared(() => {
	const cell = state({ label: 'beta', open: false });

	return { ...cell };
}, { scope: 'widget' });

export function Alpha({ label }) @{
	const ${alphaLocal} = alpha();
	${alphaLocal}.label = label;

	<div data-alpha>
		<b>{${alphaLocal}.label}</b>
		@if (${alphaLocal}.open) {
			<span data-alpha-open>alpha open</span>
		}
	</div>
}

export default function Beta({ label }) @{
	const ${betaLocal} = beta();
	${betaLocal}.label = label;

	<div data-beta>
		<b>{${betaLocal}.label}</b>
		@if (${betaLocal}.open) {
			<span data-beta-open>beta open</span>
		}
	</div>
}
`;

// What each branch flip actually subscribes to, as `branch site -> node.path`.
// A wrong node here is one widget's arm flipping on another widget's cell.
function branchTestReads(compiled: Compiled): Array<[unknown, unknown]> {
	return compiled.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'branch-update'
			? (symbol.testReads ?? []).map(
					(read) =>
						[symbol.branchSiteId, `${read.graphNodeId}.${read.path.join('.')}`] as [
							unknown,
							unknown,
						],
				)
			: [],
	);
}

// Leg one. `@if (w.open)` inside Alpha tests ALPHA's cell. The branch site
// carried no component, so the resolver matched the name against every instance
// in the module and the last `w` in the file won: both arms flipped on beta.
test('each branch condition tests the instance its own body declares', async () => {
	const compiled = await compile(branchingModuleSource('w', 'w'));

	expect(branchTestReads(compiled)).toEqual([
		['branch-site:0', 'shared:src/parts.tsrx#alpha/state:cell.open'],
		['branch-site:1', 'shared:src/parts.tsrx#beta/state:cell.open'],
	]);
});

// Every graph node a template read lowers onto, as `source -> node.path`, in
// document order.
function loweredTemplateReads(compiled: Compiled): Array<[unknown, unknown]> {
	const templateSources = new Set(
		compiled.semanticGraph.templateReads.map((read) => read.source),
	);
	return compiled.stateLowering.reads.flatMap((read) =>
		templateSources.has(read.source) && read.sourceSpan === undefined
			? [[read.source, `${read.graphNodeId}.${read.path.join('.')}`] as [unknown, unknown]]
			: [],
	);
}

// Leg two. A template read carried no component either, so state lowering
// resolved `{w.label}` module-wide: the two parts' reads produced ONE lowered
// read on the last-declared instance's node, and Alpha's text was beta's cell.
test('each part lowers its template read onto its own widget cell', async () => {
	const compiled = await compile(branchingModuleSource('w', 'w'));

	expect(loweredTemplateReads(compiled)).toEqual([
		['w.label', 'shared:src/parts.tsrx#alpha/state:cell.label'],
		['w.label', 'shared:src/parts.tsrx#beta/state:cell.label'],
	]);
});

// Byte-stability for the branching pair, the same way the other two are pinned.
test('the colliding branching module compiles to the same artifact as a distinct-name module', async () => {
	const colliding = await compile(branchingModuleSource('w', 'w'));
	const control = await compile(branchingModuleSource('w', 'seat'));

	const shape = (compiled: Compiled, locals: ReadonlyArray<string>) =>
		[...new Set(locals)].reduce(
			(text, local) => text.replace(new RegExp(`\\b${local}\\b`, 'g'), 'LOCAL'),
			JSON.stringify({
				components: compiled.publicRenderModule.componentDefinitions,
				renderChunks: compiled.renderData.chunks,
				payload: compiled.payloadArena,
				ssr: compiled.publicRenderModule.ssrModuleSource,
			}),
		);

	expect(shape(colliding, ['w'])).toEqual(shape(control, ['w', 'seat']));
});

// The branching pair stays fully accepted too.
test('the colliding branching module compiles with no diagnostic', async () => {
	const compiled = await compile(branchingModuleSource('w', 'w'));

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(compiled.publicRenderModule.diagnostics ?? []).toEqual([]);
});
