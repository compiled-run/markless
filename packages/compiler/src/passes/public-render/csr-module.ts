import { parseModule } from '@tsrx/core';
import type { PublicRenderModuleInput, SemanticMarkupResidue } from '../../artifacts.ts';
import { asNodes, childNodes, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { emitCatalogHelperImports } from './runtime-helpers.ts';
import { firstComponentRoot } from './plan.ts';
import { renderValuePreludeLines } from './render-body.ts';
import {
	callbackSymbolIds,
	componentPropNames,
	componentPropCellId,
	componentEdgesFor,
	destructureProps,
	emitValueImport,
	moduleScopeLines,
	publicRenderValueImports,
	sameModuleComponentMap,
} from './shared.ts';
import type { PublicRenderRoot } from './types.ts';

// T009b emits data registries instead of component render functions. Imported
// TSRX modules expose the same registry, so mounting a child reads its chunks
// and residue functions without calling the authored component body.
export function emitPublicCsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): {
	readonly source: string;
	readonly nativeMarkup: ReadonlyArray<{
		readonly dataId: string;
		readonly definition: Readonly<Record<string, unknown>>;
		readonly templates: ReadonlyArray<{ readonly id: string; readonly markup: string }>;
	}>;
} {
	if (
		input.publicRenderPlan.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
	) return { source: '', nativeMarkup: [] };
	const rootChunkId = input.renderData.root?.templateId;
	if (!rootChunkId) return { source: '', nativeMarkup: [] };
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);

	const importedComponents = new Map<string, string>();
	const importLines: string[] = [];
	for (const edge of input.semanticGraph.componentEdges) {
		if (!edge.importSource || importedComponents.has(edge.childComponentName)) continue;
		const localName = `__marklessCsrChunkModule${importedComponents.size}`;
		importedComponents.set(edge.childComponentName, localName);
		importLines.push(`import * as ${localName} from ${JSON.stringify(edge.importSource)};`);
	}

	const componentNames = new Set(input.semanticGraph.components.map((component) => component.name));
	const callbacks = callbackSymbolIds(input);
	const hasAuthoredBehavior = input.protocolView.behaviors.length > 0;
	const nativePayloads: Array<{
		readonly dataId: string;
		readonly definition: Record<string, unknown>;
		readonly templates: ReadonlyArray<{ readonly id: string; readonly markup: string }>;
	}> = [];
	const componentInvocations = new Map<number, AnyNode>();
	walkNode(ast, (node) => {
		if (node.type === 'JSXElement' && typeof node.start === 'number')
			componentInvocations.set(node.start, node);
	});
	const componentEntries = [...componentNames].flatMap((componentName) => {
		const componentNode = componentMap.get(componentName);
		const componentRoot = componentNode ? firstComponentRoot(componentNode) : null;
		const chunks = input.renderData.chunks.filter(
			(chunk) => chunk.componentName === componentName,
		);
		const rootChunk = chunks.find((chunk) => chunk.id === `template:${componentName}`);
		if (!rootChunk) return [];
		const edges = componentEdgesFor(input, componentName)
			.map((edge, index) => ({
				...projectionProp(input.source.source, componentInvocations.get(edge.sourceSpan.start)),
				id: edge.id,
				childComponentName: edge.childComponentName,
				hostPrefix: `c${index}:`,
				symbolPrefix: edge.importSource ? `c${index}:` : '',
				boundSymbols: Object.fromEntries(
					[...callbacks].flatMap(([key, value]) => {
						const prefix = `bound:${edge.id}:`;
						return key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [];
					}),
				),
				props: edge.props.map((prop) => ({
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
			}));
		const hostNodeIds = new Set(chunks.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)));
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
		const valueSources = componentValueSources(input, componentName, chunks, edges);
		const usedGraphNodeIds = new Set([
			...chunkGraphNodeIds(chunks),
			...edges.flatMap((edge) => edge.props.flatMap((prop) => 'graphNodeId' in prop ? [prop.graphNodeId] : [])),
		]);
		const childGraphNodeIds = new Set(
			chunkGraphNodeIds(input.renderData.chunks.filter((chunk) => chunk.componentName !== rootInfo.componentName)),
		);
		const stateGraphNodeIds = input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.componentName === componentName ||
			usedGraphNodeIds.has(binding.id) ||
			(!binding.componentName && componentName === rootInfo.componentName && !childGraphNodeIds.has(binding.id))
				? [binding.id]
				: [],
		);
		const guard = componentNode && componentRoot
			? renderGuardSource(input.source.source, componentNode, componentRoot)
			: null;
		const initialValueSources = Object.fromEntries(
			input.renderData.initialValues.flatMap((initial) => {
				if (initial.value.kind !== 'symbol-function') return [];
				const binding = input.semanticGraph.graphBindings.find(
					(candidate) => candidate.id === initial.graphNodeId,
				);
				const symbol = input.symbolResolver.symbols.find(
					(candidate) => candidate.id === initial.value.symbolId,
				);
				return symbol?.source &&
					(binding?.componentName === componentName ||
						(!binding?.componentName && componentName === rootInfo.componentName))
					? [[initial.graphNodeId, symbol.source]]
					: [];
			}),
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
		const dataId = `markless-csr-data:${encodeURIComponent(input.source.filename)}:${encodeURIComponent(componentName)}`;
        const nativeChunks = chunks.map(({ statics: _statics, ...chunk }) => ({
			...chunk,
			nativeTemplateId: `${dataId}:template:${encodeURIComponent(chunk.id)}`,
		}));
		const definitionData = {
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
			initialValueSources,
			initialValueKinds,
			stateGraphNodeIds,
			branches: input.renderData.branches.filter((branch) => branchIds.has(branch.branchSiteId)),
			repeats: input.renderData.repeats.filter((repeat) => repeatIds.has(repeat.repeatId)),
			boundaries: input.renderData.boundaries.filter((boundary) => boundaryIds.has(boundary.boundaryId)),
			edges,
			propCellId: input.semanticGraph.components.find((component) => component.name === componentName)
				? componentNode
					? componentPropCellId(componentNode)
					: null
				: null,
			ownsModuleData: componentName === rootInfo.componentName,
		};
		nativePayloads.push({
			dataId,
			definition: definitionData,
			templates: chunks.map((chunk, index) => ({
				id: nativeChunks[index]!.nativeTemplateId,
				markup: chunk.statics.join(''),
			})),
		});
		return [
			`${JSON.stringify(componentName)}: {` +
				`name:${JSON.stringify(componentName)},` +
				`dataId:${JSON.stringify(dataId)},` +
				`/*MARKLESS_CSR_TEST_START*/nativeFallback:()=>(${JSON.stringify({ ...definitionData, chunks })}),/*MARKLESS_CSR_TEST_END*/` +
				'getComponent:(name)=>marklessCsrAllChunkComponents[name],' +
				(guard ? `shouldRender:(props)=>{${destructureProps(componentPropNames(componentNode!), componentNode!).trim()}return !(${guard});},` : '') +
				`loadSymbol,` +
				(hasAuthoredBehavior ? `loadBehaviorSymbol,` : '') +
				`createValues:${emitValueFactory(input, valueSources, componentNode && componentRoot ? { component: componentNode, componentName, root: componentRoot, propNames: componentPropNames(componentNode) } : null)}` +
				`}`,
		];
	});

	const localRegistry = `export const marklessCsrChunkComponents = {${componentEntries.join(',')}};`;
	const importedRegistry = [...importedComponents].map(
		([componentName, localName]) =>
			`${JSON.stringify(componentName)}:${localName}.marklessCsrChunkComponents?.[${JSON.stringify(componentName)}]`,
	);
	const registry = `const marklessCsrAllChunkComponents = { ...marklessCsrChunkComponents, ${importedRegistry.join(',')} };`;
	const body = [
		localRegistry,
		registry,
		`const marklessRenderCsrChunks = createMarklessCsrChunkRenderer({ rootComponentName: ${JSON.stringify(rootInfo.componentName)}, components: marklessCsrAllChunkComponents });`,
		'function marklessRenderCsr(props = {}) { return marklessRenderCsrChunks(props); }',
	].join('\n');

	return { source: [
		...importLines,
		...publicRenderValueImports(
			input.semanticGraph.moduleImports,
			input.semanticGraph.componentEdges,
		).map(emitValueImport),
		...emitCatalogHelperImports(body, [
			{ module: 'csr', names: ['createMarklessCsrChunkRenderer'] },
		]),
		...moduleScopeLines(input.source.source, input.source.filename),
		body,
	]
		.filter(Boolean)
		.join('\n'), nativeMarkup: nativePayloads };
}

function componentValueSources(
	input: PublicRenderModuleInput,
	componentName: string,
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	edges: ReadonlyArray<{
		readonly props: ReadonlyArray<{ readonly kind: string; readonly source?: string }>;
	}>,
): string[] {
	const sources = new Set<string>();
	for (const chunk of chunks) {
		for (const slot of chunk.slots) {
			if ('residue' in slot) addResidueSource(sources, slot.residue);
			if (slot.kind === 'dynamic-host') {
				addResidueSource(sources, slot.tag);
				for (const attribute of slot.attributeSlots) addResidueSource(sources, attribute.residue);
			}
		}
	}
	for (const branch of input.renderData.branches)
		if (
			chunks.some((chunk) =>
				chunk.slots.some(
					(slot) => slot.kind === 'branch' && slot.branchSiteId === branch.branchSiteId,
				),
			)
		)
			sources.add(branch.testSource);
	for (const edge of edges)
		for (const prop of edge.props)
			if (prop.kind !== 'callback' && prop.source) sources.add(prop.source);
	for (const initial of input.renderData.initialValues) {
		if (initial.value.kind !== 'symbol-function') continue;
		const symbol = input.symbolResolver.symbols.find(
			(candidate) => candidate.id === initial.value.symbolId,
		);
		const binding = input.semanticGraph.graphBindings.find(
			(candidate) => candidate.id === initial.graphNodeId,
		);
		if (
			symbol?.source &&
			(binding?.componentName === componentName ||
				(!binding?.componentName && componentName === input.renderData.root?.componentName))
		)
			sources.add(symbol.source);
	}
	return [...sources].filter(Boolean);
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
			) dynamic = true;
		});
	}
	const start = children[0]?.start;
	const end = children.at(-1)?.end;
	if (dynamic || typeof start !== 'number' || typeof end !== 'number') return {};
	return { projection: { kind: 'static-markup', markup: source.slice(start, end), elementCount } };
}

function chunkGraphNodeIds(chunks: PublicRenderModuleInput['renderData']['chunks']): string[] {
	const ids = new Set<string>();
	const addResidue = (residue: SemanticMarkupResidue | undefined) => {
		if (residue?.kind === 'graph-read') ids.add(residue.graphNodeId);
	};
	for (const chunk of chunks) {
		for (const slot of chunk.slots) {
			if ('residue' in slot) addResidue(slot.residue);
			if (slot.kind === 'dynamic-host') {
				addResidue(slot.tag);
				for (const attribute of slot.attributeSlots) addResidue(attribute.residue);
			}
		}
	}
	return [...ids];
}

function renderGuardSource(source: string, component: AnyNode, root: AnyNode): string | null {
	for (const statement of childNodes(component.body as AnyNode)) {
		if (statement === root || (statement.type === 'ReturnStatement' && statement.argument === root)) break;
		if (statement.type !== 'IfStatement') continue;
		const consequent = statement.consequent as AnyNode | undefined;
		const returned = consequent?.type === 'ReturnStatement'
			? consequent.argument
			: asNodes(consequent?.body).find((candidate) => candidate.type === 'ReturnStatement')?.argument;
		if (
			returned == null ||
			(returned as AnyNode).type === 'NullLiteral' ||
			((returned as AnyNode).type === 'Literal' && (returned as AnyNode).value === null)
		)
			return expressionSource(statement.test as AnyNode, source);
	}
	return null;
}

function addResidueSource(sources: Set<string>, residue: SemanticMarkupResidue): void {
	if (residue.kind === 'authored-expression') sources.add(residue.source);
}

function emitValueFactory(
	input: PublicRenderModuleInput,
	sources: ReadonlyArray<string>,
	rootInfo: PublicRenderRoot | null,
): string {
	const declared = new Set<string>();
	const lines: string[] = [];
	const propDestructure = rootInfo
		? destructureProps(rootInfo.propNames, rootInfo.component)?.trim() ?? ''
		: '';
	if (rootInfo) lines.push(...renderValuePreludeLines(input, rootInfo, sources));
	for (const repeat of input.semanticGraph.keyedRepeats) {
		if (declared.has(repeat.itemName)) continue;
		declared.add(repeat.itemName);
		lines.push(`const ${repeat.itemName}=locals[${JSON.stringify(repeat.itemName)}];`);
	}
	if (!declared.has('error')) lines.push('const error=locals.error;');
	const entries = sources.map((source) => `${JSON.stringify(source)}:()=>(${source})`);
	return `(props,read,locals,marklessReadCsrValue)=>{${propDestructure}${lines.join('')}return {${entries.join(',')}};}`;
}
