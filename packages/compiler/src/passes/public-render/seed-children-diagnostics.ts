import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { childrenSeedPathsByComponent } from '../link/children-seed-paths.ts';
import { PROJECTION_PROP_NAME, staticProjectionChildren } from './shared-seed-pass.ts';

export const SEED_CHILDREN_UNAVAILABLE_CODE = 'MARKLESS_SEED_CHILDREN_UNAVAILABLE' as const;

/**
 * A part that seeds shared state from `children`, placed where the children it
 * would seed from do not exist yet.
 *
 * The seed pass runs before a projection renders, because the parts inside that
 * projection render from what the seed wrote. So the only `children` a seed can
 * be handed is one the consumer spelled as a prop, or a projection of static
 * text, which is already in the compiled chunk. A projection carrying elements
 * or reactive reads has no value until it renders, and the seed would silently
 * take undefined - and the sibling that reads the seeded cell would already have
 * painted by the time the real value arrived.
 */
export function seedChildrenUnavailableDiagnostic(input: {
	readonly componentName: string;
	readonly statePath: string;
	readonly sourceSpan?: CompilerDiagnostic['primarySpan'];
}): CompilerDiagnostic {
	return {
		code: SEED_CHILDREN_UNAVAILABLE_CODE,
		severity: 'error',
		phase: 'public-render',
		title: 'These children cannot be seeded into shared state',
		message: `<${input.componentName}> seeds "${input.statePath}" from its children, but the children written here contain markup or a value that is worked out while they render, so the seed would read nothing.`,
		why: 'Shared state is seeded before the projected children render, because those children render from what the seed wrote. Only children the consumer passes as a prop, or children that are plain static text, are known that early.',
		...(input.sourceSpan ? { primarySpan: input.sourceSpan } : {}),
		passId: 'public-render-module',
		artifactKeys: ['publicRenderModule'],
		statePath: input.statePath,
		suggestions: [
			{
				message: `Write the value as a prop (children={...}), or put plain text between the tags, or move the write into an event handler where the shared instance is already live.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${SEED_CHILDREN_UNAVAILABLE_CODE}`,
	};
}

/**
 * Every placement in this module whose child seeds from `children` and whose
 * projection cannot answer that seed. A child compiled here is read off this
 * module's own seed routes; an imported one off `seedsFromProps` on the
 * interface its module published, so the placement is checked where it is
 * written either way.
 */
export function collectSeedChildrenDiagnostics(
	input: PublicRenderModuleInput,
): ReadonlyArray<CompilerDiagnostic> {
	const seedPaths = childrenSeedPathsByComponent(input);
	return input.semanticGraph.componentEdges.flatMap((edge) => {
		const statePath = edge.importSource
			? importedChildrenSeedPath(input, edge.importSource, edge.childComponentName)
			: seedPaths.get(edge.childComponentName);
		if (statePath === undefined) return [];
		if (edge.props.some((prop) => prop.name === PROJECTION_PROP_NAME)) return [];
		const projectionChunkId = input.renderData.chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'child-component' && slot.componentEdgeId === edge.id
					? [slot.projectionChunkId]
					: [],
			),
		)[0];
		// No projection at all leaves `children` undefined for the render too, so
		// the seed and the render agree and nothing is lost between them.
		if (projectionChunkId === undefined) return [];
		if (staticProjectionChildren(input.renderData.chunks, projectionChunkId) !== undefined)
			return [];
		return [
			seedChildrenUnavailableDiagnostic({
				componentName: edge.childComponentName,
				statePath,
				...(edge.sourceSpan ? { sourceSpan: edge.sourceSpan } : {}),
			}),
		];
	});
}

// The cell an imported child seeds from its `children`, off the interface its
// own module published — the same channel the child's prop names arrive on.
function importedChildrenSeedPath(
	input: PublicRenderModuleInput,
	importSource: string,
	childComponentName: string,
): string | undefined {
	return input.source.importedModuleInterfaces?.[importSource]?.render.components
		.find((component) => component.componentName === childComponentName)
		?.seedsFromProps?.find((seed) => seed.prop === PROJECTION_PROP_NAME)?.statePath;
}
