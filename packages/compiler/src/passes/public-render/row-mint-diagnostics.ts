import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import type {
	CompilerDiagnostic,
	ModuleGraphInterfaceArtifact,
	SemanticGraphArtifact,
	SemanticMarkupArtifact,
	SemanticMarkupSlot,
} from '../../artifacts.ts';
import { mintableSlotValue, resolveRowComponentMint } from '../row-mint.ts';
import {
	keyedRepeatRowMintUnsupportedDiagnostic,
	type KeyedRepeatRowMintRefusal,
} from './diagnostics.ts';

/**
 * A keyed @for whose rows cannot be built in the browser says so.
 *
 * The payload ships one row of finished markup, or the identity of the
 * component a row roots, so an item appended after the page loads can still
 * become a row. A row shape that gets neither still renders and reorders what
 * the server sent, and silently drops every new item - the one outcome no
 * channel otherwise mentions.
 */
export function collectKeyedRepeatRowMintDiagnostics(input: {
	readonly root: AnyNode;
	readonly semanticGraph: SemanticGraphArtifact;
	readonly filename: string;
	readonly source: string;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): ReadonlyArray<CompilerDiagnostic> {
	if (input.semanticGraph.keyedRepeats.length === 0) return [];
	const componentNames = input.semanticGraph.components.map((component) => component.name);
	const paired = new Set<string>();
	const diagnostics: CompilerDiagnostic[] = [];
	walkNode(input.root, (node) => {
		if (node.type !== 'JSXForExpression') return;
		const repeat = pairedRepeat(node, input.semanticGraph, input.source, paired);
		if (!repeat) return;
		paired.add(repeat.id);
		const refusal = rowMintRefusal({
			chunks: input.semanticGraph.markup.chunks,
			componentEdges: input.semanticGraph.componentEdges,
			componentNames,
			branchSites: input.semanticGraph.branchSites,
			...(input.importedModuleInterfaces
				? { importedModuleInterfaces: input.importedModuleInterfaces }
				: {}),
			repeatId: repeat.id,
			itemName: repeat.itemName,
		});
		if (!refusal) return;
		diagnostics.push(
			keyedRepeatRowMintUnsupportedDiagnostic({
				itemName: repeat.itemName,
				refusal,
				node,
				filename: input.filename,
			}),
		);
	});
	return diagnostics;
}

// The same identity the markup collector paired chunks by, so the node this
// reports on is the node whose row chunk was measured.
function pairedRepeat(
	node: AnyNode,
	semanticGraph: SemanticGraphArtifact,
	source: string,
	paired: ReadonlySet<string>,
): SemanticGraphArtifact['keyedRepeats'][number] | undefined {
	const itemName = repeatItemName(node) ?? 'item';
	const collection = node.right as AnyNode | undefined;
	const key = node.key as AnyNode | undefined;
	return semanticGraph.keyedRepeats.find(
		(candidate) =>
			!paired.has(candidate.id) &&
			candidate.itemName === itemName &&
			candidate.collectionSource === (collection ? expressionSource(collection, source) : '') &&
			candidate.keySource === (key ? expressionSource(key, source) : ''),
	);
}

function rowMintRefusal(input: {
	readonly chunks: SemanticMarkupArtifact['chunks'];
	readonly componentEdges: SemanticGraphArtifact['componentEdges'];
	readonly componentNames: ReadonlyArray<string>;
	readonly branchSites: SemanticGraphArtifact['branchSites'];
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly repeatId: string;
	readonly itemName: string;
}): KeyedRepeatRowMintRefusal | null {
	const rowChunkId = `repeat:${input.repeatId}:row`;
	const chunk = input.chunks.find((candidate) => candidate.id === rowChunkId);
	if (!chunk) return null;
	const componentSlot = chunk.slots.find((slot) => slot.kind === 'child-component');
	if (componentSlot?.kind === 'child-component') {
		const mint = resolveRowComponentMint({
			chunks: input.chunks,
			componentEdges: input.componentEdges,
			componentNames: input.componentNames,
			...(input.importedModuleInterfaces
				? { importedModuleInterfaces: input.importedModuleInterfaces }
				: {}),
			rowChunkId,
			rowElementCount: chunk.hosts.length,
			itemName: input.itemName,
		});
		return mint ? null : { kind: 'component', componentName: componentSlot.childComponentName };
	}
	for (const slot of chunk.slots) {
		if (slot.kind === 'text' || slot.kind === 'attribute') {
			// The mint fills a text or attribute slot from the item or from the page's
			// graph, so what is left is a value only the render can produce.
			if (mintableSlotValue(slot)) continue;
			return {
				kind: 'unfillable-read',
				read: unfillableReadLabel(slot),
				...(slot.kind === 'attribute' ? { attributeName: slot.name } : {}),
			};
		}
		return { kind: 'nested-construct', label: nestedConstructLabel(slot, input.branchSites) };
	}
	return null;
}

// The author's own words for the value the mint cannot carry, so the diagnostic
// names the read rather than its category.
function unfillableReadLabel(slot: SemanticMarkupSlot): string {
	const residue = slot.kind === 'text' || slot.kind === 'attribute' ? slot.residue : undefined;
	if (residue?.kind === 'authored-expression') return residue.source;
	if (residue?.kind === 'element-handle-id')
		return `the id of the ${handleName(residue.handleGraphNodeId)} element handle`;
	if (residue?.kind === 'element-handle-id-list')
		return `the ids of the ${residue.handleGraphNodeIds.map(handleName).join(' and ')} element handles`;
	return 'a value the browser has no record for';
}

function handleName(handleGraphNodeId: string): string {
	return handleGraphNodeId.split(/[:/]/).pop() ?? handleGraphNodeId;
}

function nestedConstructLabel(
	slot: SemanticMarkupSlot,
	branchSites: SemanticGraphArtifact['branchSites'],
): string {
	switch (slot.kind) {
		case 'branch': {
			const site = branchSites.find((candidate) => candidate.id === slot.branchSiteId);
			return site?.kind === 'switch' ? '@switch' : '@if';
		}
		case 'async':
			return '@try';
		case 'repeat':
			return 'a nested @for';
		case 'dynamic-host':
			return 'an element whose tag is chosen while rendering';
		default:
			return 'a spread of attributes';
	}
}

function repeatItemName(node: AnyNode): string | null {
	const left = node.left as AnyNode | undefined;
	if (!left) return null;
	if (left.type !== 'VariableDeclaration') return getIdentifierName(left);
	const [declaration] = asNodes(left.declarations);
	return getIdentifierName(declaration?.id as AnyNode | undefined);
}
