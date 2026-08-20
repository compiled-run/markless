import { installSharedSeedPass, type SharedSeedPass } from '../prerender/shared-seed-slot.ts';

// A seed is a per-instance initial value built from the child's own props, so
// running it needs those props and the factory initial, not the child's markup.
const seedProjectingChild: SharedSeedPass = async (
	context,
	definition,
	componentEdgeId,
	read,
	inherited,
) => {
	const edge = (definition.edges ?? []).find((candidate) => candidate.id === componentEdgeId);
	if (!edge || edge.materialized) return inherited;
	const surface = context.surface;
	const child = (
		surface.components[edge.childComponentName]
			? surface
			: surface.imports[edge.childComponentName]
	)?.components[edge.childComponentName];
	const initials = child?.initialValues ?? [];
	const seeds = initials.filter(
		(initial) => child?.initialValueKinds?.[initial.graphNodeId] === 'shared-seed',
	);
	if (!child || seeds.length === 0) return inherited;

	const childProps: Record<string, unknown> = {};
	for (const prop of edge.props) {
		if (prop.kind === 'graph-reference' && prop.graphNodeId) {
			childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
		} else if (prop.kind === 'serializable' && 'value' in prop) {
			childProps[prop.name] = prop.value;
		}
	}
	const seeded = new Map(inherited ?? []);
	const readSeed: PrerenderReadSeed = (graphNodeId, path = []) =>
		readPath(
			graphNodeId === child.propCellId || graphNodeId === 'prop:props'
				? childProps
				: graphNodeId.startsWith('prop:')
					? childProps[graphNodeId.slice(5)]
					: seeded.get(graphNodeId),
			path,
		);
	for (const initial of seeds) {
		if (initial.value.kind !== 'symbol-function') continue;
		const factory = initials.find(
			(candidate) =>
				candidate.graphNodeId === initial.graphNodeId && candidate.value.kind === 'constant',
		)?.value;
		if (!seeded.has(initial.graphNodeId) && factory?.kind === 'constant')
			seeded.set(initial.graphNodeId, structuredClone(factory.value));
		const loaded = await context.loadSymbol(
			edge.boundSymbols?.[initial.value.symbolId] ??
				context.symbolPrefix + edge.symbolPrefix + initial.value.symbolId,
		);
		if (typeof loaded !== 'function')
			throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${initial.value.symbolId}`);
		seeded.set(initial.graphNodeId, await loaded({ graph: { read: readSeed }, read: readSeed }));
	}
	return seeded;
};

type PrerenderReadSeed = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Teaches this app's CSR render path to run a projecting component's shared
 * seeds before the components projected into it render. The bundler emits a
 * call to it in the render-data module of every .tsrx whose compiler planned a
 * shared-seed symbol, so a build with no widget seeds never loads this module
 * and its render path renders projections unseeded. The call is explicit
 * because `@markless/web` declares `sideEffects: false`.
 */
export function installMarklessSharedSeedPass(): void {
	installSharedSeedPass(seedProjectingChild);
}
