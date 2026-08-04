import { parseModule } from '@tsrx/core';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { asNodes, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { firstComponentRoot } from './plan.ts';
import {
	callbackSymbolIds,
	componentPropNames,
	componentPropCellId,
	componentEdgesFor,
	sameModuleComponentMap,
} from './shared.ts';
import type { PublicRenderRoot } from './types.ts';

// Component definitions are compiler data consumed by the linked prerender
// surface. They deliberately contain no browser render function or native CSR
// payload; client settlement evaluates the canonical render-data surface.
export function collectPublicRenderComponentDefinitions(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const materializations = input.source.artifactChildMaterializations ?? {};
	const componentNames = new Set(input.semanticGraph.components.map((component) => component.name));
	const callbacks = callbackSymbolIds(input);
	const componentInvocations = new Map<number, AnyNode>();
	walkNode(ast, (node) => {
		if (node.type === 'JSXElement' && typeof node.start === 'number') {
			componentInvocations.set(node.start, node);
		}
	});

	return [...componentNames].flatMap((componentName) => {
		const componentNode = componentMap.get(componentName);
		const componentRoot = componentNode ? firstComponentRoot(componentNode) : null;
		const chunks = input.renderData.chunks.filter(
			(chunk) => chunk.componentName === componentName,
		);
		const rootChunk = chunks.find((chunk) => chunk.id === `template:${componentName}`);
		if (!rootChunk) return [];
		const edges = componentEdgesFor(input, componentName).map((edge, index) => {
			const declaredInputs = childComponentInputs(input, componentMap, edge);
			const passedInputs = new Set(edge.props.map((prop) => prop.name));
			return {
				...projectionProp(input.source.source, componentInvocations.get(edge.sourceSpan.start)),
				id: edge.id,
				childComponentName: edge.childComponentName,
				...(edge.asyncBoundaryId ? { asyncBoundaryId: edge.asyncBoundaryId } : {}),
				hostPrefix: `c${index}:`,
				symbolPrefix: edge.importSource ? `c${index}:` : '',
				boundSymbols: Object.fromEntries(
					[...callbacks].flatMap(([key, value]) => {
						const prefix = `bound:${edge.id}:`;
						return key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [];
					}),
				),
				props: [
					...edge.props.map((prop) => ({
						name: prop.name,
						kind: prop.kind,
						...('graphNodeId' in prop
							? { graphNodeId: prop.graphNodeId, path: prop.path }
							: {}),
						...('value' in prop ? { value: prop.value } : {}),
						...(prop.kind === 'callback'
							? { symbolId: callbacks.get(`${edge.id}:${prop.name}`) }
							: {}),
						...(prop.kind === 'callback' ? {} : { source: prop.source }),
					})),
					...declaredInputs.flatMap((name) =>
						passedInputs.has(name) ? [] : [{ name, kind: 'absent' }],
					),
				],
				...(materializations[edge.id]
					? { materialized: materializations[edge.id] }
					: {}),
			};
		});
		const hostNodeIds = new Set(
			chunks.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)),
		);
		const branchIds = new Set(
			chunks.flatMap((chunk) =>
				chunk.slots.flatMap((slot) =>
					slot.kind === 'branch' ? [slot.branchSiteId] : [],
				),
			),
		);
		const boundaryIds = new Set(
			chunks.flatMap((chunk) =>
				chunk.slots.flatMap((slot) =>
					slot.kind === 'async' ? [slot.boundaryId] : [],
				),
			),
		);
		const repeatIds = new Set(
			chunks.flatMap((chunk) =>
				chunk.slots.flatMap((slot) => (slot.kind === 'repeat' ? [slot.repeatId] : [])),
			),
		);
		const usedGraphNodeIds = new Set([
			...chunkGraphNodeIds(chunks),
			...edges.flatMap((edge) =>
				edge.props.flatMap((prop) =>
					'graphNodeId' in prop && typeof prop.graphNodeId === 'string'
						? [prop.graphNodeId]
						: [],
				),
			),
		]);
		const childGraphNodeIds = new Set(
			chunkGraphNodeIds(
				input.renderData.chunks.filter(
					(chunk) => chunk.componentName !== rootInfo.componentName,
				),
			),
		);
		const stateGraphNodeIds = input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.componentName === componentName ||
			usedGraphNodeIds.has(binding.id) ||
			(!binding.componentName &&
				componentName === rootInfo.componentName &&
				!childGraphNodeIds.has(binding.id))
				? [binding.id]
				: [],
		);
		const initialValueKinds = Object.fromEntries(
			input.renderData.initialValues.flatMap((initial) => {
				if (initial.value.kind !== 'symbol-function') return [];
				const symbol = input.symbolResolver.symbols.find(
					(candidate) => candidate.id === initial.value.symbolId,
				);
				return symbol ? [[initial.graphNodeId, symbol.kind]] : [];
			}),
		);
		const nativeChunks = chunks.map(({ statics: _statics, ...chunk }) => ({
			...chunk,
			nativeTemplateId: `markless-render-data:${encodeURIComponent(input.source.filename)}:${encodeURIComponent(componentName)}:template:${encodeURIComponent(chunk.id)}`,
		}));
		return [
			{
				name: componentName,
				state: input.protocolState,
				view: input.protocolView,
				rootChunkId: rootChunk.id,
				chunks: nativeChunks,
				hostNodeIds: [...hostNodeIds],
				branchIds: [...branchIds],
				boundaryIds: [...boundaryIds],
				repeatIds: [...repeatIds],
				initialValues: input.renderData.initialValues,
				initialValueKinds,
				stateGraphNodeIds,
				branches: input.renderData.branches.filter((branch) =>
					branchIds.has(branch.branchSiteId),
				),
				repeats: input.renderData.repeats.filter((repeat) => repeatIds.has(repeat.repeatId)),
				boundaries: input.renderData.boundaries.filter((boundary) =>
					boundaryIds.has(boundary.boundaryId),
				),
				edges,
				propCellId:
					input.semanticGraph.components.find(
						(component) => component.name === componentName,
					) && componentNode && componentRoot
						? componentPropCellId(componentNode)
						: null,
				ownsModuleData: componentName === rootInfo.componentName,
			},
		];
	});
}

function childComponentInputs(
	input: PublicRenderModuleInput,
	componentMap: ReadonlyMap<string, AnyNode>,
	edge: PublicRenderModuleInput['semanticGraph']['componentEdges'][number],
): ReadonlyArray<string> {
	if (!edge.importSource) return componentPropNames(componentMap.get(edge.childComponentName));
	const linked = input.source.importedModuleInterfaces?.[edge.importSource];
	return (
		linked?.render.components.find(
			(component) => component.componentName === edge.childComponentName,
		)?.inputs ?? []
	).flatMap((input) => input.path[0] ?? input.localName);
}

function projectionProp(source: string, node: AnyNode | undefined): Record<string, unknown> {
	const children = asNodes(node?.children);
	if (children.length === 0) return {};
	let dynamic = false;
	let elementCount = 0;
	for (const child of children) {
		walkNode(child, (candidate) => {
			if (candidate.type === 'JSXElement') elementCount++;
			if (
				candidate.type === 'JSXExpressionContainer' ||
				candidate.type === 'TSRXIfStatement' ||
				candidate.type === 'TSRXForOfStatement' ||
				candidate.type === 'TSRXTryStatement'
			) {
				dynamic = true;
			}
		});
	}
	const start = children[0]?.start;
	const end = children.at(-1)?.end;
	if (dynamic || typeof start !== 'number' || typeof end !== 'number') return {};
	return { projection: { kind: 'static-markup', markup: source.slice(start, end), elementCount } };
}

function chunkGraphNodeIds(chunks: PublicRenderModuleInput['renderData']['chunks']): string[] {
	return chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			if ('residue' in slot && slot.residue.kind === 'graph-read') {
				return [slot.residue.graphNodeId];
			}
			if (slot.kind === 'dynamic-host') {
				return slot.attributeSlots.flatMap((attribute) =>
					attribute.residue.kind === 'graph-read'
						? [attribute.residue.graphNodeId]
						: [],
				);
			}
			return [];
		}),
	);
}
