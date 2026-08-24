import { parseModule } from '../../js-ast.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { asNodes, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { firstComponentRoot } from './plan.ts';
import { sharedCallbackSlotGraphNodeId } from '../semantic-graph/collect-shared.ts';
import { emitClientResidueReader, emitClientResidueReaderPrelude } from './residue-reader.ts';
import { widgetRootDefinitionIds } from './shared-seed-pass.ts';
import {
	callbackSymbolIds,
	componentPropNames,
	componentPropCellId,
	componentEdgeInstanceSegment,
	componentEdgesFor,
	componentOwnedInitialValues,
	componentOwnedStateNodes,
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
	const componentNames = new Set(
		input.semanticGraph.components.map((component) => component.name),
	);
	const callbacks = callbackSymbolIds(input);
	const componentInvocations = new Map<number, AnyNode>();
	walkNode(ast, (node) => {
		if (node.type === 'JSXElement' && typeof node.start === 'number') {
			componentInvocations.set(node.start, node);
		}
	});

	const residueReaderPrelude = emitClientResidueReaderPrelude(input, [...componentNames]);

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
				...projectionProp(
					input.source.source,
					edge.sourceSpan ? componentInvocations.get(edge.sourceSpan.start) : undefined,
				),
				id: edge.id,
				childComponentName: edge.childComponentName,
				...(edge.asyncBoundaryId ? { asyncBoundaryId: edge.asyncBoundaryId } : {}),
				hostPrefix: `c${index}:`,
				symbolPrefix: componentEdgeInstanceSegment(edge, input.semanticGraph.componentEdges),
				boundSymbols: Object.fromEntries(
					[...callbacks].flatMap(([key, value]) => {
						const prefix = `bound:${edge.id}:`;
						return key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [];
					}),
				),
				props: [
					// Ahead of the written props: a name the tag spreads must not be
					// undone by the absence of a tag attribute for it.
					...declaredInputs.flatMap((name) =>
						passedInputs.has(name) ? [] : [{ name, kind: 'absent' }],
					),
					...edge.props.map((prop) => ({
						name: prop.name,
						kind: prop.kind,
						...('graphNodeId' in prop
							? { graphNodeId: prop.graphNodeId, path: prop.path }
							: {}),
						...('excludeNames' in prop ? { excludeNames: prop.excludeNames } : {}),
						...('value' in prop ? { value: prop.value } : {}),
						...(prop.kind === 'callback'
							? { symbolId: callbacks.get(`${edge.id}:${prop.name}`) }
							: {}),
						...(prop.kind === 'callback' ? {} : { source: prop.source }),
					})),
				],
				...(materializations[edge.id] ? { materialized: materializations[edge.id] } : {}),
			};
		});
		const hostNodeIds = new Set(
			chunks.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)),
		);
		const branchIds = new Set(
			chunks.flatMap((chunk) =>
				chunk.slots.flatMap((slot) => (slot.kind === 'branch' ? [slot.branchSiteId] : [])),
			),
		);
		const boundaryIds = new Set(
			chunks.flatMap((chunk) =>
				chunk.slots.flatMap((slot) => (slot.kind === 'async' ? [slot.boundaryId] : [])),
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
		// A widget-scoped shared() graph is one instance per rendered widget, so its
		// nodes travel with the components that resolve it, not with the module root.
		const widgetScoped = new Set(
			input.semanticGraph.sharedDefinitions.flatMap((definition) =>
				definition.scope === 'widget' ? [definition.id] : [],
			),
		);
		const resolvedDefinitionIds = new Set(
			input.semanticGraph.sharedInstances.flatMap((instance) =>
				instance.componentName === componentName ? [instance.definitionId] : [],
			),
		);
		const stateGraphNodeIds = input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.componentName === componentName ||
			usedGraphNodeIds.has(binding.id) ||
			(binding.sharedDefinitionId !== undefined &&
				widgetScoped.has(binding.sharedDefinitionId) &&
				resolvedDefinitionIds.has(binding.sharedDefinitionId)) ||
			// A shared() node belongs to the page, so the root keeps it even when
			// only a child component reads it.
			(binding.sharedDefinitionId !== undefined &&
				!widgetScoped.has(binding.sharedDefinitionId) &&
				componentName === rootInfo.componentName) ||
			(!binding.componentName &&
				binding.sharedDefinitionId === undefined &&
				componentName === rootInfo.componentName &&
				!childGraphNodeIds.has(binding.id))
				? [binding.id]
				: [],
		);
		// A callback slot has no graph binding to travel with, so the root that
		// fills it carries its node the way it carries the rest of its widget's.
		const slotGraphNodeIds = (input.semanticGraph.sharedCallbackBindings ?? []).flatMap(
			(binding) =>
				binding.componentName === componentName
					? [sharedCallbackSlotGraphNodeId(binding.definitionId, binding.slotName)]
					: [],
		);
		const initialValues = withComponentSharedSeeds(
			componentNames.size > 1
				? componentOwnedInitialValues(input, componentName, rootInfo.componentName)
				: input.renderData.initialValues,
			input,
			componentName,
		);
		const initialValueKinds = Object.fromEntries(
			initialValues.flatMap((initial) => {
				// Held in a const so the discriminated narrowing survives into the callback.
				const value = initial.value;
				if (value.kind !== 'symbol-function') return [];
				const symbol = input.symbolResolver.symbols.find(
					(candidate) => candidate.id === value.symbolId,
				);
				return symbol ? [[initial.graphNodeId, symbol.kind]] : [];
			}),
		);
		const nativeChunks = chunks.map(({ statics: _statics, ...chunk }) => ({
			...chunk,
			nativeTemplateId: `markless-render-data:${encodeURIComponent(input.source.filename)}:${encodeURIComponent(componentName)}:template:${encodeURIComponent(chunk.id)}`,
		}));
		// Positions resolve a state name two components of one module both
		// declare; a single-component module needs no partition at all.
		const ownedNodes =
			componentNames.size > 1
				? componentOwnedStateNodes(input, componentName, rootInfo.componentName)
				: undefined;
		return [
			{
				name: componentName,
				state: input.protocolState,
				...(ownedNodes
					? {
							stateCellIndexes: ownedNodes.cellIndexes,
							stateComputedIndexes: ownedNodes.computedIndexes,
						}
					: {}),
				view: input.protocolView,
				rootChunkId: rootChunk.id,
				chunks: nativeChunks,
				hostNodeIds: [...hostNodeIds],
				branchIds: [...branchIds],
				boundaryIds: [...boundaryIds],
				repeatIds: [...repeatIds],
				initialValues,
				initialValueKinds,
				stateGraphNodeIds: [...stateGraphNodeIds, ...slotGraphNodeIds],
				branches: input.renderData.branches.filter((branch) =>
					branchIds.has(branch.branchSiteId),
				),
				repeats: input.renderData.repeats.filter((repeat) =>
					repeatIds.has(repeat.repeatId),
				),
				boundaries: input.renderData.boundaries.filter((boundary) =>
					boundaryIds.has(boundary.boundaryId),
				),
				edges,
				propCellId:
					input.semanticGraph.components.find(
						(component) => component.name === componentName,
					) &&
					componentNode &&
					componentRoot
						? componentPropCellId(componentNode)
						: null,
				ownsModuleData: componentName === rootInfo.componentName,
				// Build-time only: the bundler reads it to decide whether this module's
				// render-data needs the shared-seed pass, then strips it before the
				// record is serialised, so it costs the payload nothing.
				...(widgetRootDefinitionIds(input, componentName).length > 0
					? { rootsWidget: true }
					: {}),
				...residueReaderFields(),
			},
		];

		function residueReaderFields(): Record<string, unknown> {
			const readerSource = emitClientResidueReader(
				input,
				componentName,
				rootInfo.componentName,
				componentNode,
			);
			if (!readerSource) return {};
			return {
				residueReaderSource: readerSource,
				...(residueReaderPrelude.imports.length
					? { residueReaderImports: residueReaderPrelude.imports }
					: {}),
				...(residueReaderPrelude.declarations.length
					? { residueReaderDeclarations: residueReaderPrelude.declarations }
					: {}),
			};
		}
	});
}

// A component body's shared seed is a per-instance initial value, so it rides
// this component's definition alone. It is spliced in before the first sync
// computed derive: a derive that reads the seeded node must see the seeded value.
function withComponentSharedSeeds(
	initialValues: PublicRenderModuleInput['renderData']['initialValues'],
	input: PublicRenderModuleInput,
	componentName: string,
): PublicRenderModuleInput['renderData']['initialValues'] {
	const seeds = input.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'shared-seed' && symbol.componentName === componentName
			? [
					{
						graphNodeId: symbol.graphNodeId,
						value: { kind: 'symbol-function' as const, symbolId: symbol.id },
					},
				]
			: [],
	);
	if (seeds.length === 0) return initialValues;

	const deriveIds = new Set(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'sync-computed-derive' ? [symbol.id] : [],
		),
	);
	const firstDerive = initialValues.findIndex(
		(initial) => initial.value.kind === 'symbol-function' && deriveIds.has(initial.value.symbolId),
	);
	return firstDerive === -1
		? [...initialValues, ...seeds]
		: [
				...initialValues.slice(0, firstDerive),
				...seeds,
				...initialValues.slice(firstDerive),
			];
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
	return {
		projection: { kind: 'static-markup', markup: source.slice(start, end), elementCount },
	};
}

function chunkGraphNodeIds(chunks: PublicRenderModuleInput['renderData']['chunks']): string[] {
	return chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			if ('residue' in slot && slot.residue.kind === 'graph-read') {
				return [slot.residue.graphNodeId];
			}
			if (slot.kind === 'dynamic-host') {
				return slot.attributeSlots.flatMap((attribute) =>
					attribute.residue.kind === 'graph-read' ? [attribute.residue.graphNodeId] : [],
				);
			}
			return [];
		}),
	);
}
