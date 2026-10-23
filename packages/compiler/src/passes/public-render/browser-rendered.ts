import { jsonSourceWithNonFiniteNumbers } from '@markless/serializer';
import {
	addressedHostNodeIds,
	withInertHostsFolded,
} from '../../artifact-helpers/addressed-hosts.ts';
import type { PublicRenderModuleInput, ServedRenderDataArtifact } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import {
	componentAstsForResidueReaders,
	emitClientResidueReader,
	emitClientResidueReaderPrelude,
	type ClientResidueScope,
} from './residue-reader.ts';

type RenderChunk = PublicRenderModuleInput['renderData']['chunks'][number];

/**
 * The parts of a module a server-rendered page can still render in the browser.
 * The browser renders markup only where the graph can change it: the rows of a
 * `@for` over graph data, the arms of an `@if`/`@switch` whose test reads the
 * graph, async arms and dynamic tags, with everything placed inside them. Every
 * other chunk exists only in the served HTML, so its markup, its statics and the
 * data they read never need to reach the browser.
 */
export type BrowserRenderedParts = {
	readonly chunkIds: ReadonlySet<string>;
	/** Component edges placed inside those chunks: the child may be rendered whole. */
	readonly edgeIds: ReadonlySet<string>;
	/** Same-module components placed inside those chunks. */
	readonly componentNames: ReadonlySet<string>;
};

export function browserRenderedParts(input: PublicRenderModuleInput): BrowserRenderedParts {
	const chunks = new Map(input.renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const repeats = new Map(input.renderData.repeats.map((repeat) => [repeat.repeatId, repeat]));
	const branches = new Map(
		input.renderData.branches.map((branch) => [branch.branchSiteId, branch]),
	);
	const chunkIds = new Set<string>();
	const edgeIds = new Set<string>();
	const componentNames = new Set<string>();
	const visited = new Set<string>();

	const visit = (chunkId: string | undefined, rendered: boolean): void => {
		const chunk = chunkId ? chunks.get(chunkId) : undefined;
		if (!chunk) return;
		const key = `${rendered ? 1 : 0}:${chunk.id}`;
		if (visited.has(key)) return;
		visited.add(key);
		if (rendered) chunkIds.add(chunk.id);
		for (const slot of chunk.slots) visitSlot(slot, rendered);
	};

	const visitSlot = (slot: RenderChunk['slots'][number], rendered: boolean): void => {
		switch (slot.kind) {
			case 'repeat': {
				const rows =
					rendered || repeats.get(slot.repeatId)?.collectionGraphNodeId !== undefined;
				visit(slot.rowTemplateId, rows);
				visit(slot.emptyTemplateId, rows);
				return;
			}
			case 'branch': {
				const branch = branches.get(slot.branchSiteId);
				const flips =
					rendered ||
					!branch ||
					branch.testReads.length > 0 ||
					branch.testComputedGraphNodeId !== undefined;
				for (const arm of slot.armTemplateIds) visit(arm, flips);
				return;
			}
			case 'async':
				for (const arm of Object.values(slot.armTemplateIds)) visit(arm, true);
				return;
			case 'dynamic-host':
				visit(slot.childChunkId, true);
				return;
			case 'child-component':
				if (rendered) {
					edgeIds.add(slot.componentEdgeId);
					if (chunks.has(slot.childTemplateId))
						componentNames.add(slot.childComponentName);
				}
				visit(slot.projectionChunkId, rendered);
				visit(
					chunks.has(slot.childTemplateId) ? slot.childTemplateId : undefined,
					rendered,
				);
				return;
			default:
				return;
		}
	};

	for (const component of input.semanticGraph.components)
		visit(`template:${component.name}`, false);
	return { chunkIds, edgeIds, componentNames };
}

export function collectServedRenderData(
	input: PublicRenderModuleInput,
	rootComponentName: string,
): ServedRenderDataArtifact {
	const parts = browserRenderedParts(input);
	const scope: ClientResidueScope = {
		inChunk: (chunkId) => parts.chunkIds.has(chunkId),
		withInitializers: (componentName) => parts.componentNames.has(componentName),
	};
	const componentNames = input.semanticGraph.components.map((component) => component.name);
	const asts = componentAstsForResidueReaders(input.source.source, input.source.filename);
	const readers: Record<string, string> = {};
	for (const componentName of componentNames) {
		const reader = emitClientResidueReader(
			input,
			componentName,
			rootComponentName,
			asts.get(componentName) as AnyNode | undefined,
			scope,
		);
		if (reader) readers[componentName] = reader;
	}
	const prelude = emitClientResidueReaderPrelude(input, componentNames, scope);
	const renderData = {
		...input.renderData,
		chunks: input.renderData.chunks.map((chunk) =>
			parts.chunkIds.has(chunk.id)
				? chunk
				: { ...chunk, statics: chunk.statics.map(() => '') },
		),
	};
	return {
		renderDataModuleSource: `export const marklessRenderData = ${jsonSourceWithNonFiniteNumbers(withInertHostsFolded(renderData, addressedHostNodeIds(input.protocolView))) ?? 'undefined'};`,
		readers,
		imports: prelude.imports,
		declarations: prelude.declarations,
		browserRenderedComponents: [...parts.componentNames],
		browserRenderedEdgeIds: [...parts.edgeIds],
		evaluatedComponents: [
			...new Set([
				...parts.componentNames,
				...input.renderData.chunks.flatMap((chunk) =>
					parts.chunkIds.has(chunk.id) ? [chunk.componentName] : [],
				),
			]),
		],
	};
}
