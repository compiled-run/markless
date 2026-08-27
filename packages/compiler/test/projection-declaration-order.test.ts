import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Where a component sits in its module must not change what its projection
// compiles to. A @markless/ui family is a root plus its parts in ONE file, so a
// component that projects is routinely the second, fifth or ninth declaration —
// and a projection chunk lost to declaration order is silent: the children
// simply never reach the child that was supposed to hold them.
//
// The invariants below are checked between two structurally IDENTICAL projecting
// components declared at different positions of one module, so the only thing
// that varies is position. Counters that are unique per module by design —
// element ids, branch sites, symbols, and the `c<n>:`/`p<n>:` instance segments —
// are normalised to their shape, which is what attribution means: a lost
// projection turns `c#:p#:` into `c#:`, and that still fails.

const CHILD = `export function Frame({ children }) @{
	<div class="frame">{children}</div>
}

export function Leaf() @{
	<span class="leaf">l</span>
}`;

function moduleWith(body: string): string {
	return `${CHILD}

export function First({ children }) @{
${body.split('NAME').join('First')}
}

export function Second({ children }) @{
${body.split('NAME').join('Second')}
}
`;
}

async function compile(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	expect(compiled.semanticGraph.diagnostics.filter((entry) => entry.severity === 'error')).toEqual(
		[],
	);
	return compiled;
}

type Compiled = Awaited<ReturnType<typeof compile>>;

// The module-wide counters, reduced to their shape. Everything else must match.
function normalise(text: string, componentName: string, edgeBase: number): string {
	return text
		.split(componentName)
		.join('COMPONENT')
		.replace(
			/component-edge(:|%3A)(\d+)/g,
			(_match, separator, digits) => `component-edge${separator}${Number(digits) - edgeBase}`,
		)
		.replace(/\b(h)\d+\b/g, '$1#')
		.replace(/(branch-site)(:|%3A)\d+/g, '$1$2#')
		.replace(/\b(symbol|boundary):\d+/g, '$1:#')
		.replace(/([cp])\d+:/g, '$1#:')
		.replace(/"(index|anchorOrder)":\d+/g, '"$1":#');
}

function edgeBaseOf(compiled: Compiled, componentName: string): number {
	const owned = compiled.semanticGraph.componentEdges.filter(
		(edge) => edge.parentComponentName === componentName,
	);
	expect(owned.length).toBeGreaterThan(0);
	return Math.min(...owned.map((edge) => Number(edge.id.slice('component-edge:'.length))));
}

/** Everything this compile says about one component's projection, normalised. */
function projectionFacts(compiled: Compiled, componentName: string): Record<string, string> {
	const base = edgeBaseOf(compiled, componentName);
	const shape = (value: unknown) => normalise(JSON.stringify(value ?? null), componentName, base);

	const ssr = compiled.publicRenderModule.ssrModuleSource ?? '';
	const start = ssr.indexOf(`async function marklessRenderSsr${componentName}(`);
	const ssrFunction = start === -1 ? 'MISSING' : ssr.slice(start, ssr.indexOf('\n}\n', start));

	return {
		chunks: shape(
			compiled.semanticGraph.markup.chunks.filter(
				(chunk) => chunk.componentName === componentName,
			),
		),
		definition: shape(
			(compiled.publicRenderModule.componentDefinitions as ReadonlyArray<{ name: string }>).find(
				(entry) => entry.name === componentName,
			),
		),
		interfaceEntry: shape(
			compiled.moduleGraphInterface.render.components.find(
				(entry) => entry.componentName === componentName,
			),
		),
		ssrFunction: normalise(ssrFunction, componentName, base),
	};
}

/**
 * Every projection chunk a slot names exists, and belongs to the same component
 * as the chunk that names it. This is the fail-closed half: a projection chunk
 * attributed to another component is one no per-component walk can reach, and
 * nothing downstream would report the gap.
 */
function projectionAttributionGaps(compiled: Compiled): string[] {
	const chunks = compiled.semanticGraph.markup.chunks;
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const gaps: string[] = [];
	const seenIds = new Set<string>();
	for (const chunk of chunks) {
		if (seenIds.has(chunk.id)) gaps.push(`duplicate chunk id ${chunk.id}`);
		seenIds.add(chunk.id);
		for (const slot of chunk.slots) {
			if (slot.kind !== 'child-component' || !slot.projectionChunkId) continue;
			const projection = byId.get(slot.projectionChunkId);
			if (!projection) {
				gaps.push(`${chunk.id} names missing projection chunk ${slot.projectionChunkId}`);
				continue;
			}
			if (projection.componentName !== chunk.componentName)
				gaps.push(
					`${slot.projectionChunkId} belongs to ${projection.componentName}, named from ${chunk.componentName}'s ${chunk.id}`,
				);
		}
	}
	return gaps;
}

const shapes: ReadonlyArray<readonly [string, string]> = [
	['a bare projection', '\t<Frame><span class="NAME">{children}</span></Frame>'],
	[
		'two projections side by side',
		'\t<div><Frame><b>{children}</b></Frame><Frame><i>x</i></Frame></div>',
	],
	['a part beside the projected children', '\t<Frame><Leaf />{children}</Frame>'],
	[
		'a projection inside an @if arm',
		'\t<div>\n\t\t@if (children) {\n\t\t\t<Frame><Leaf />{children}</Frame>\n\t\t}\n\t</div>',
	],
	['a projection nested in a projection', '\t<Frame><Frame><Leaf />{children}</Frame></Frame>'],
];

for (const [label, body] of shapes) {
	test(`${label} compiles the same wherever the component is declared`, async () => {
		const compiled = await compile(moduleWith(body));
		const first = projectionFacts(compiled, 'First');
		const second = projectionFacts(compiled, 'Second');

		expect(first.ssrFunction).not.toBe('MISSING');
		expect(second.ssrFunction).not.toBe('MISSING');
		expect(second).toEqual(first);
	});
}

test('every projection chunk belongs to the component that projects it', async () => {
	for (const [, body] of shapes)
		expect(projectionAttributionGaps(await compile(moduleWith(body)))).toEqual([]);
});

test('a projecting component keeps its projection at the ninth declaration', async () => {
	// Nine components deep is past any plausible first-wins horizon, and the last
	// one is the one a family's own file would put last.
	const filler = Array.from(
		{ length: 6 },
		(_value, index) => `export function Part${index}() @{
	<i class="p${index}">${index}</i>
}`,
	).join('\n\n');
	const source = `${CHILD}

${filler}

export function Early({ children }) @{
	<Frame><Leaf />{children}</Frame>
}

export function Late({ children }) @{
	<Frame><Leaf />{children}</Frame>
}
`;
	const compiled = await compile(source);
	expect(projectionAttributionGaps(compiled)).toEqual([]);
	expect(projectionFacts(compiled, 'Late')).toEqual(projectionFacts(compiled, 'Early'));
});

test('a second projecting component below does not disturb the first one', async () => {
	const body = '\t<Frame><Leaf />{children}</Frame>';
	const together = await compile(moduleWith(body));
	const alone = await compile(`${CHILD}

export function First({ children }) @{
${body}
}
`);

	// Only the projection itself: a module's payload node ownership is positional
	// across every component it declares, so the rest of the definition legitimately
	// widens when a component is added.
	expect(projectionFacts(together, 'First').chunks).toBe(projectionFacts(alone, 'First').chunks);
	expect(projectionFacts(together, 'First').interfaceEntry).toBe(
		projectionFacts(alone, 'First').interfaceEntry,
	);
});
