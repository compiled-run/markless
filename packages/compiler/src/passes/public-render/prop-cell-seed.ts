import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { componentDeriveGraphNodeIds } from './derive-set.ts';
import { componentPropCellId } from './shared.ts';

/**
 * A prop cell the served payload has to carry, and which of its properties.
 * `keys` names the properties the bag must hold; `null` marks a cell that IS one
 * destructured prop. `scalarKeys` names properties only a resume-time derive
 * reads, which the payload carries only when their value is a scalar.
 */
export type SsrPropCellSeed = {
	readonly graphNodeId: string;
	readonly keys: ReadonlyArray<string> | null;
	readonly scalarKeys?: ReadonlyArray<string>;
};

type PropRead = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

// The prop reads a browser flip makes to rebuild this component's arms — an arm
// showing projected `children` is the common one.
function armRebuildPropReads(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<PropRead> {
	return input.renderData.chunks.flatMap((chunk) =>
		chunk.componentName !== componentName ||
		(chunk.kind !== 'branch-arm' && chunk.kind !== 'async-arm')
			? []
			: chunk.slots.flatMap((slot) =>
					slot.kind === 'text' && slot.residue.kind === 'graph-read'
						? [{ graphNodeId: slot.residue.graphNodeId, path: slot.residue.path }]
						: [],
				),
	);
}

/**
 * The prop reads this component's resume-time derives make. A sync `computed()`
 * re-derives in the browser off the graph, so a part whose only motion is
 * `computed(() => shared.value === value)` has no arm to rebuild yet still needs
 * `value` in the payload, or the derive reads `undefined` forever after resume.
 */
function derivePropReads(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<PropRead> {
	const reachable = componentDeriveGraphNodeIds(input, componentName);
	return input.protocolState.computed.flatMap((computed) =>
		computed.async ||
		computed.deriveSymbolId === undefined ||
		!reachable.has(computed.graphNodeId)
			? []
			: (computed.dependencies ?? []).map((dependency) => ({
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
				})),
	);
}

/**
 * The prop cells this component's server render has to leave in the payload. A
 * bag cell keeps only the properties something reads back: a props bag can hold
 * projected `children` markup, already in the served HTML, so a read naming no
 * property widens nothing.
 */
export function ssrPropCellSeeds(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): ReadonlyArray<SsrPropCellSeed> {
	const bagCellId = component ? componentPropCellId(component) : null;
	const armKeysByCell = new Map<string, Set<string> | null>();
	for (const { graphNodeId, path } of armRebuildPropReads(input, componentName)) {
		if (!graphNodeId.startsWith('prop:')) continue;
		if (graphNodeId === 'prop:props' || graphNodeId === bagCellId) {
			const keys = armKeysByCell.get(graphNodeId) ?? new Set<string>();
			if (path[0]) keys.add(path[0]);
			armKeysByCell.set(graphNodeId, keys);
		} else armKeysByCell.set(graphNodeId, null);
	}

	// A derive read only widens a bag: the whole-prop cells stay whatever the arm
	// rebuilds asked for.
	const deriveKeysByCell = new Map<string, Set<string>>();
	for (const { graphNodeId, path } of derivePropReads(input, componentName)) {
		if (graphNodeId !== 'prop:props' && graphNodeId !== bagCellId) continue;
		if (!path[0] || armKeysByCell.get(graphNodeId)?.has(path[0])) continue;
		const keys = deriveKeysByCell.get(graphNodeId) ?? new Set<string>();
		keys.add(path[0]);
		deriveKeysByCell.set(graphNodeId, keys);
	}

	return [...new Set([...armKeysByCell.keys(), ...deriveKeysByCell.keys()])].flatMap(
		(graphNodeId): SsrPropCellSeed[] => {
			const armKeys = armKeysByCell.has(graphNodeId)
				? (armKeysByCell.get(graphNodeId) ?? null)
				: new Set<string>();
			const deriveKeys = [...(deriveKeysByCell.get(graphNodeId) ?? [])];
			if (armKeys === null) return [{ graphNodeId, keys: null }];
			if (armKeys.size === 0 && deriveKeys.length === 0) return [];
			return [
				{
					graphNodeId,
					keys: [...armKeys],
					...(deriveKeys.length > 0 ? { scalarKeys: deriveKeys } : {}),
				},
			];
		},
	);
}

// The composed state a server-rendered component returns, plus the prop cells
// its arm flips and its resume-time derives read back.
export function ssrComposeStateExpression(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): string {
	const composed = 'marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren)';
	const cells = ssrPropCellSeeds(input, component, componentName);
	return cells.length === 0
		? composed
		: `marklessSsrSeedPropCells(${composed}, props, ${JSON.stringify(cells)})`;
}
