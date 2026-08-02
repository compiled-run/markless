import {
	marklessBaseSymbolId,
	marklessBoundSymbolId,
	marklessLiveBoundGraphRoute,
} from './bound-symbol.ts';
import { marklessSerializeGraphValue } from './state-serialize.ts';

export function marklessComposeState(state, children) {
	const childStates = children.map((child) => child.output?.state).filter(Boolean);
	if (!childStates.length) return state;
	marklessAssertComposableStateNames(state, childStates);
	for (const child of children) child.output?.m?.(child.graphProps);
	const sharedDefinitions = [
		...(state.sharedDefinitions ?? []),
		...childStates.flatMap((childState) => childState.sharedDefinitions ?? []),
	];
	return {
		...state,
		cells: [
			...(state.cells ?? []),
			...childStates.flatMap((childState) => childState.cells ?? []),
		],
		computed: [
			...(state.computed ?? []),
			...children.flatMap((child) =>
				(child.output?.state?.computed ?? []).map((computed) => ({
					...computed,
					...(computed.deriveSymbolId
						? { deriveSymbolId: marklessBoundSymbolId(child, computed.deriveSymbolId) }
						: {}),
				})),
			),
		],
		...(sharedDefinitions.length ? { sharedDefinitions } : {}),
	};
}
export function marklessCsrRemapGraphOutput(output, graphProps) {
	// A composed CSR prop is the source node's committed mount value. Seed that
	// node before the page graph is built so a downstream-first write can read it.
	const props = output.state.cells.find((cell) =>
		cell.graphNodeId.startsWith('prop:'),
	)?.directValue;
	if (props)
		for (const prop of graphProps ?? [])
			if (
				marklessLiveBoundGraphRoute(prop)?.path.length === 0 &&
				props[prop.name] !== undefined
			)
				output.state.cells.push({
					graphNodeId: prop.graphNodeId,
					directValue: props[prop.name],
				});
	output.state.computed = output.state.computed.map((computed) => ({
		...computed,
		...(computed.dependencies && {
			dependencies: computed.dependencies.map(
				(dependency) => marklessCsrRemapChildGraph(dependency, graphProps) ?? dependency,
			),
		}),
	}));
	const loadSymbol = output.loadSymbol;
	if (!loadSymbol || !graphProps?.length) return;
	output.loadSymbol = (symbolId) =>
		Promise.resolve(loadSymbol(symbolId)).then(
			(symbol) => (context) =>
				symbol({
					...context,
					graph: {
						...context.graph,
						read(graphNodeId, path = []) {
							const mapped = marklessCsrRemapChildGraph(
								{ graphNodeId, path },
								graphProps,
							);
							return context.graph.read(
								mapped?.graphNodeId ?? graphNodeId,
								mapped?.path ?? path,
							);
						},
					},
				}),
		);
}
// Graph node ids are NAME-based per module and compose merges child state
// into ONE page graph unprefixed: same-named state()/computed() in a page
// and a composed component would silently share one value (and one streaming
// runner). Refuse loudly (D2) until graph ids are instance-scoped; shared
// definitions keep their cross-module ids on purpose.
export function marklessAssertComposableStateNames(state, childStates) {
	const seen = new Set(
		[...(state.cells ?? []), ...(state.computed ?? [])].map((node) => node.graphNodeId),
	);
	for (const childState of childStates) {
		for (const node of [...(childState.cells ?? []), ...(childState.computed ?? [])]) {
			const id = node.graphNodeId;
			// Only author-renamable state()/computed() names are diagnosable.
			// Live directValue cells seed mapped prop sources and are not declarations.
			// Shared definitions and props compose by design; compiler-synthesized
			// names (computed:templateExpression:0) carry extra ':' segments and
			// repeat in ~every module — their sharing is the ledgered
			// instance-scoped-graph-ids follow-on, not an author collision.
			if (
				node.directValue !== undefined ||
				id.startsWith('shared:') ||
				id.startsWith('prop:') ||
				id.slice(id.indexOf(':') + 1).includes(':')
			)
				continue;
			if (seen.has(id)) {
				throw Object.assign(
					new Error(
						`MARKLESS_COMPOSED_STATE_COLLISION: Two components on this page both declare state() or computed() named "${id.slice(id.indexOf(':') + 1)}". Composed components share one state graph, so they would read and write the same value. Rename one of them.`,
					),
					{
						code: 'MARKLESS_COMPOSED_STATE_COLLISION',
						graphNodeId: id,
						docsUrl: 'https://markless.dev/errors/MARKLESS_COMPOSED_STATE_COLLISION',
					},
				);
			}
			seen.add(id);
		}
	}
}
export function marklessCsrRemapChildGraph(record, graphProps) {
	const whole = record.graphNodeId === 'prop:props';
	if (!whole && !record.graphNodeId.startsWith('prop:')) return record;
	const binding = graphProps.find(
		(prop) => prop.name === (whole ? record.path[0] : record.graphNodeId.slice(5)),
	);
	const liveRoute = marklessLiveBoundGraphRoute(binding);
	return liveRoute
		? {
				graphNodeId: liveRoute.graphNodeId,
				path: [...liveRoute.path, ...record.path.slice(+whole)],
			}
		: null;
}
export function marklessCsrRemapChildKeyedRepeat(repeat, graphProps, hostPrefix = '') {
	const graphNodeId = repeat.collectionGraphNodeId;
	if (!graphNodeId) return null;
	const whole = graphNodeId === 'prop:props';
	if (!whole && !graphNodeId.startsWith('prop:')) {
		return { graphNodeId, path: repeat.collectionPath };
	}
	const propName = whole ? repeat.collectionPath[0] : graphNodeId.slice(5);
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	if (binding?.kind !== undefined && binding.kind !== 'graph-reference') return null;
	const mapped = marklessCsrRemapChildGraph(
		{ graphNodeId, path: repeat.collectionPath },
		graphProps ?? [],
	);
	if (mapped) return mapped;
	throw new Error(
		'MARKLESS_COMPOSED_READ_UNMAPPED: ' + hostPrefix + repeat.id,
	);
}
export function marklessCsrRemapChildDomUpdate(update, graphProps, hostPrefix = '') {
	const whole = update.graphNodeId === 'prop:props';
	if (!whole && !update.graphNodeId.startsWith('prop:')) return update;
	const propName = whole ? update.path[0] : update.graphNodeId.slice(5);
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	if (binding?.kind !== undefined && binding.kind !== 'graph-reference') return null;
	// Projected children are rendered by the parent's chunk slots. A wrapper
	// component's synthetic `children` text record therefore has no live graph
	// route of its own and must not be registered as a child-owned refresh.
	if (!binding && propName === 'children') return null;
	const mapped = marklessCsrRemapChildGraph(update, graphProps ?? []);
	if (mapped) return mapped;

	const targetName = update.target?.name ? `:${update.target.name}` : '';
	const recordId = `dom-update:${update.hostNodeId}:${update.target?.kind ?? 'unknown'}${targetName}`;
	const hostNodeId = hostPrefix + update.hostNodeId;
	const symbolId = update.symbolId ?? '<missing>';
	throw Object.assign(
		new Error(
			`MARKLESS_COMPOSED_DOM_UPDATE_UNMAPPED: DOM update "${recordId}" on host "${hostNodeId}" with symbol "${symbolId}" reads prop "${propName}", but composition found no route.`,
		),
		{
			code: 'MARKLESS_COMPOSED_DOM_UPDATE_UNMAPPED',
			recordId,
			hostNodeId,
			symbolId,
			propName,
		},
	);
}
export function marklessCsrRemapChildReads(reads, graphProps, recordId) {
	return (reads ?? []).map((read) => {
		const mapped = marklessCsrRemapChildGraph(read, graphProps);
		if (!mapped) throw new Error('MARKLESS_COMPOSED_READ_UNMAPPED: ' + recordId);
		return { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path };
	});
}
export function marklessCsrIsThenable(value) {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof value.then === 'function'
	);
}

// Native-chunk CSR bootstrap (T009b). The compiler supplies markup strings and
// direct slot coordinates. This code visits only declared residue slots,
// component hosts, boundary arms, and data rows; cloneNode/native parsing owns
// every static subtree.
export function createMarklessCsrChunkRenderer(input) {
	return function renderMarklessCsrChunks(props = {}) {
		const definition = input.components[input.rootComponentName];
		if (!definition) throw new Error(`Missing Markless CSR component ${input.rootComponentName}.`);
		return renderChunkComponent(definition, props, input.components, '', '', 0, false);
	};
}

function renderChunkComponent(definition, props, components, idPrefix, symbolPrefix, depth, armBoundary, eventElements) {
	definition = marklessCsrNativeDefinition(definition);
	if (depth > 32) throw new Error(`Markless CSR component recursion exceeded at ${definition.name}.`);
	if (definition.shouldRender && !definition.shouldRender(props)) return null;
	const chunks = new Map(definition.chunks.map((chunk) => [chunk.id, chunk]));
	const templates = new Map();
	const initial = new Map();
	for (const entry of definition.initialValues ?? []) {
		if (entry.value.kind === 'constant') initial.set(entry.graphNodeId, entry.value.value);
	}
	const propCell = props ?? {};
	let valueFunctions;
	const read = (graphNodeId, path = []) => {
		let value;
		if (graphNodeId === definition.propCellId || graphNodeId === 'prop:props') value = propCell;
		else if (graphNodeId.startsWith('prop:')) value = propCell[graphNodeId.slice(5)];
		else if (runtimeState.graph) {
			value = runtimeState.graph.read(graphNodeId, []);
			if (value?.status === 'fulfilled') value = value.value;
			else if (value?.status === 'rejected') value = value.error;
		}
		else if (initial.has(graphNodeId)) value = initial.get(graphNodeId);
		else {
			const source = definition.initialValueSources?.[graphNodeId];
			if (source) {
				initial.set(graphNodeId, undefined);
				valueFunctions ??= definition.createValues(
					props,
					read,
					{},
					readMarklessCsrChunkPath,
				);
				value = valueFunctions[source]?.();
				if (
					typeof value === 'function' &&
					definition.initialValueKinds?.[graphNodeId]?.includes('computed')
				)
					value = value?.();
				initial.set(graphNodeId, value);
			}
		}
		return readMarklessCsrChunkPath(value, path);
	};
	const runtimeState = { graph: null, root: null };
	const childOutputs = [];
	const activeHostNodeIds = new Set();
		const cloneChunk = (chunkId) => {
			const chunk = chunks.get(chunkId);
			if (!chunk) throw new Error(`Missing Markless render chunk ${chunkId}.`);
			let template = templates.get(chunkId);
			if (!template) {
				template = chunk.nativeTemplateId
					? document.getElementById?.(chunk.nativeTemplateId)
					: undefined;
				if (!template) {
					// Test-only/backward-compatible definitions may still provide inline
					// statics. Compiler output always supplies a browser-parsed template.
					template = document.createElement('template');
					template.innerHTML = chunk.statics.join('');
				}
				templates.set(chunkId, template);
			}
			return { chunk, content: template.content.cloneNode(true) };
		};

	let eventCoordinates = eventElements;
	const renderChunk = (chunkId, locals = {}, armBoundary = false) => {
		const cloned = cloneChunk(chunkId);
		const hostNodes = new Map(
			cloned.chunk.hosts.flatMap((host) => {
				const node = marklessCsrChunkNodeAtPath(cloned.content, host.coordinate.path);
				return node?.nodeType === 1 ? [[host.hostNodeId, node]] : [];
			}),
		);
		if (eventCoordinates) collectEventCoordinates(eventCoordinates, hostNodes, idPrefix);
		const renderedHostNodeIds = new Set(cloned.chunk.hosts.map((host) => host.hostNodeId));
		const renderedRepeatIds = new Set();
		const renderedBranchIds = new Set();
		const renderedBoundaryIds = new Set();
		const branchAnchors = new Map();
		const boundaryAnchors = new Map();
		const mergeAnchors = (rendered) => {
			for (const [id, anchors] of rendered.branchAnchors) branchAnchors.set(id, anchors);
			for (const [id, anchors] of rendered.boundaryAnchors) boundaryAnchors.set(id, anchors);
		};
		for (const host of cloned.chunk.hosts) activeHostNodeIds.add(host.hostNodeId);
		const placements = [];
		let insertedHosts = 0;
		let values;
		const getValues = () =>
			(values ??= definition.createValues(
				props,
				read,
				locals,
				readMarklessCsrChunkPath,
			));
		const slotTargets = new Map(
			cloned.chunk.slots.map((slot) => [slot, marklessCsrChunkNodeAtPath(cloned.content, slot.coordinate.path)]),
		);
		for (const slot of cloned.chunk.slots) {
			const target = slotTargets.get(slot);
			if (!target) continue;
			if (slot.kind === 'text') {
				const value = readMarklessCsrChunkResidue(slot.residue, read, locals, getValues);
				if (
					value?.kind === 'chunk-projection' ||
					value?.kind === 'static-markup' ||
					(typeof value === 'string' && slot.residue?.kind === 'graph-read' && slot.residue.path?.[0] === 'children')
				) {
					const projection = value?.kind === 'chunk-projection'
						? value.content
						: document.createElement('template');
					if (value?.kind !== 'chunk-projection')
						projection.innerHTML = value?.kind === 'static-markup' ? value.markup : value;
					marklessCsrChunkReplace(cloned.content, target, projection.content ?? projection);
					insertedHosts += value?.elementCount ?? 0;
				} else target.replaceWith(document.createTextNode(stringifyMarklessCsrChunkValue(value)));
				continue;
			}
			if (slot.kind === 'attribute') {
				const value = readMarklessCsrChunkResidue(slot.residue, read, locals, getValues);
				if (value == null || value === false) target.removeAttribute?.(slot.name);
				else target.setAttribute?.(slot.name, stringifyMarklessCsrChunkValue(value));
				continue;
			}
			const baseIndex = countMarklessChunkHostsBefore(cloned.chunk, slot.coordinate.path) + insertedHosts;
			if (slot.kind === 'child-component') {
				const edge = definition.edges.find((candidate) => candidate.id === slot.componentEdgeId);
				const childDefinition = definition.getComponent?.(slot.childComponentName) ?? components[slot.childComponentName];
				if (!edge || !childDefinition) {
					target.remove?.();
					continue;
				}
				const projected = slot.projectionChunkId
					? renderChunk(slot.projectionChunkId, locals, armBoundary)
					: undefined;
				const childProps = marklessCsrChunkChildProps(
					edge,
					read,
					locals,
					getValues,
					runtimeState,
					definition.loadSymbol,
					projected
						? {
							kind: 'chunk-projection',
							content: projected.content,
							elementCount: projected.hostCount,
						}
						: undefined,
				);
				const child = renderChunkComponent(
					childDefinition,
					childProps,
					components,
					idPrefix + edge.hostPrefix,
					symbolPrefix + edge.symbolPrefix,
					depth + 1,
					armBoundary,
					eventCoordinates,
				);
				if (!child) {
					target.remove?.();
					continue;
				}
				marklessCsrChunkReplace(cloned.content, target, child.root);
				placements.push({ edge, output: child, baseIndex });
				childOutputs.push({ edge, output: child });
				if (projected) {
					mergeAnchors(projected);
					for (const [hostNodeId, node] of projected.hostNodes) hostNodes.set(hostNodeId, node);
					for (const hostNodeId of projected.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
					for (const repeatId of projected.repeatIds) renderedRepeatIds.add(repeatId);
					for (const branchId of projected.branchIds) renderedBranchIds.add(branchId);
					for (const boundaryId of projected.boundaryIds) renderedBoundaryIds.add(boundaryId);
				}
				insertedHosts += child.elementCount;
				continue;
			}
			if (slot.kind === 'repeat') {
				renderedRepeatIds.add(slot.repeatId);
				const repeat = definition.repeats.find((candidate) => candidate.repeatId === slot.repeatId);
				const collection = repeat?.collectionGraphNodeId
					? read(repeat.collectionGraphNodeId, repeat.collectionPath)
					: [];
				const rows = Array.isArray(collection) ? collection : Array.from(collection ?? []);
				const nodes = [];
				let hostCount = 0;
				const rowHostNodeIds = new Set();
				if (rows.length === 0 && slot.emptyTemplateId) {
					const empty = renderChunk(slot.emptyTemplateId, locals, armBoundary);
					mergeAnchors(empty);
					nodes.push(...empty.nodes);
					hostCount += empty.hostCount;
					for (const [hostNodeId, node] of empty.hostNodes) hostNodes.set(hostNodeId, node);
					for (const hostNodeId of empty.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
					for (const hostNodeId of empty.hostNodeIds) rowHostNodeIds.add(hostNodeId);
				} else {
					for (const item of rows) {
						const row = renderChunk(slot.rowTemplateId, { ...locals, [repeat.itemName]: item }, armBoundary);
						mergeAnchors(row);
						nodes.push(...row.nodes);
						hostCount += row.hostCount;
						for (const [hostNodeId, node] of row.hostNodes) hostNodes.set(hostNodeId, node);
						for (const hostNodeId of row.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
						for (const hostNodeId of row.hostNodeIds) rowHostNodeIds.add(hostNodeId);
					}
				}
				marklessCsrChunkReplace(cloned.content, target, ...nodes);
				placements.push({ baseIndex, elementCount: hostCount, hostNodeIds: rowHostNodeIds });
				insertedHosts += hostCount;
				continue;
			}
			if (slot.kind === 'branch') {
				renderedBranchIds.add(slot.branchSiteId);
				const branch = definition.branches.find((candidate) => candidate.branchSiteId === slot.branchSiteId);
				const taken = marklessCsrChunkBranchArm(branch, getValues, read);
				const arm = renderChunk(slot.armTemplateIds[taken] ?? slot.armTemplateIds[0], locals, armBoundary);
				mergeAnchors(arm);
				for (const [hostNodeId, node] of arm.hostNodes) hostNodes.set(hostNodeId, node);
				for (const hostNodeId of arm.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				const anchors = marklessCsrChunkAnchors(target, armBoundary ? 'arm-branch' : 'branch', idPrefix + slot.branchSiteId);
				branchAnchors.set(idPrefix + slot.branchSiteId, anchors);
				marklessCsrChunkReplace(cloned.content, target, anchors.start, ...arm.nodes, anchors.end);
				placements.push({ baseIndex, elementCount: arm.hostCount, hostNodeIds: arm.hostNodeIds });
				insertedHosts += arm.hostCount;
				continue;
			}
			if (slot.kind === 'async') {
				renderedBoundaryIds.add(slot.boundaryId);
				const chunkId = slot.armTemplateIds.pending ?? slot.armTemplateIds.try;
				const arm = renderChunk(chunkId, locals, armBoundary);
				mergeAnchors(arm);
				for (const [hostNodeId, node] of arm.hostNodes) hostNodes.set(hostNodeId, node);
				for (const hostNodeId of arm.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				const anchors = marklessCsrChunkAnchors(target, 'async', idPrefix + slot.boundaryId);
				boundaryAnchors.set(idPrefix + slot.boundaryId, anchors);
				marklessCsrChunkReplace(cloned.content, target, anchors.start, ...arm.nodes, anchors.end);
				placements.push({ baseIndex, elementCount: arm.hostCount, hostNodeIds: arm.hostNodeIds });
				insertedHosts += arm.hostCount;
				continue;
			}
			if (slot.kind === 'dynamic-host') {
				const tag = readMarklessCsrChunkResidue(slot.tag, read, locals, getValues);
				if (tag == null) {
					target.remove?.();
					continue;
				}
				const host = document.createElement(String(tag));
				for (const [hostNodeId, node] of hostNodes)
					if (node === target) hostNodes.set(hostNodeId, host);
				for (const [name, value] of Object.entries(slot.staticAttributes ?? {})) host.setAttribute(name, value);
				for (const attribute of slot.attributeSlots ?? []) {
					const value = readMarklessCsrChunkResidue(attribute.residue, read, locals, getValues);
					if (attribute.kind === 'attribute' && value != null && value !== false)
						host.setAttribute(attribute.name, stringifyMarklessCsrChunkValue(value));
					else if (attribute.kind === 'spread' && value && typeof value === 'object')
						for (const [name, spreadValue] of Object.entries(value))
							if (spreadValue != null && spreadValue !== false)
								host.setAttribute(name, stringifyMarklessCsrChunkValue(spreadValue));
				}
				const children = renderChunk(slot.childChunkId, locals, armBoundary);
				mergeAnchors(children);
				for (const hostNodeId of children.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				for (const node of children.nodes) host.appendChild(node);
				marklessCsrChunkReplace(cloned.content, target, host);
				placements.push({ baseIndex, elementCount: 1 + children.hostCount, hostNodeIds: children.hostNodeIds });
				insertedHosts += 1 + children.hostCount;
			}
		}
		return {
			nodes: Array.from(cloned.content.childNodes ?? []),
			content: cloned.content,
				hostCount: cloned.chunk.hosts.length + insertedHosts,
				hostNodeIds: renderedHostNodeIds,
				hostNodes,
			placements,
			repeatIds: renderedRepeatIds,
			branchIds: renderedBranchIds,
			boundaryIds: renderedBoundaryIds,
			branchAnchors,
			boundaryAnchors,
		};
	};

	const rendered = renderChunk(definition.rootChunkId, {}, armBoundary);
	const root = rendered.nodes.length === 1
		? rendered.nodes[0]
		: rendered.content;
	if (!root) throw new Error('Markless CSR chunk did not create a root.');
	runtimeState.root = root;
	const renderedEdgeIds = new Set(childOutputs.map((child) => child.edge.id));
	const deferredChildOutputs = (definition.edges ?? []).flatMap((edge) => {
		if (renderedEdgeIds.has(edge.id)) return [];
		const childDefinition = definition.getComponent?.(edge.childComponentName) ?? components[edge.childComponentName];
		return childDefinition
			? [{ edge, output: marklessCsrDeferredChunkOutput(childDefinition, components, depth + 1) }]
			: [];
	});
	const symbolRoutes = [...childOutputs, ...deferredChildOutputs];
	const state = marklessCsrChunkState(definition, props, initial, symbolRoutes);
	let view = marklessCsrChunkView(
		definition,
		rendered.placements,
		childOutputs,
		idPrefix,
		symbolPrefix,
		{
			hostNodeIds: activeHostNodeIds,
			repeatIds: rendered.repeatIds,
			branchIds: rendered.branchIds,
			boundaryIds: rendered.boundaryIds,
		},
	);
	const liveHostNodes = new Map(
		[...rendered.hostNodes].map(([hostNodeId, node]) => [idPrefix + hostNodeId, node]),
	);
	for (const child of childOutputs)
		for (const [hostNodeId, node] of child.output.liveHostNodes ?? [])
			liveHostNodes.set(hostNodeId, node);
	view = marklessCsrBindChunkAnchors(view, rendered.branchAnchors, rendered.boundaryAnchors);
	view = {
		...view,
		asyncBoundaries: (view.asyncBoundaries ?? []).map((boundary) => {
			const localBoundaryId = boundary.id.startsWith(idPrefix)
				? boundary.id.slice(idPrefix.length)
				: boundary.id;
			const slot = definition.chunks
				.flatMap((chunk) => chunk.slots)
				.find((candidate) => candidate.kind === 'async' && candidate.boundaryId === localBoundaryId);
			if (!slot) return boundary;
			return {
				...boundary,
				renderArm(status) {
					const chunkId = status === 'rejected'
						? slot.armTemplateIds.catch
						: slot.armTemplateIds.try;
					if (!chunkId) throw new Error(`Missing Markless async arm chunk for ${boundary.id}.`);
					const childStart = childOutputs.length;
					const parentEventCoordinates = eventCoordinates;
					const armEventElements = (eventCoordinates = new Map());
					const arm = renderChunk(chunkId, {}, true);
					eventCoordinates = parentEventCoordinates;
					const armChildren = childOutputs.slice(childStart);
					const armRoot = arm.content;
					let armView = marklessCsrChunkView(
						definition,
						arm.placements,
						armChildren,
						idPrefix,
						symbolPrefix,
						{
							hostNodeIds: arm.hostNodeIds,
							repeatIds: arm.repeatIds,
							branchIds: arm.branchIds,
							boundaryIds: arm.boundaryIds,
						},
					);
					const armHostNodes = new Map(
						[...arm.hostNodes].map(([hostNodeId, node]) => [idPrefix + hostNodeId, node]),
					);
					for (const child of armChildren)
						for (const [hostNodeId, node] of child.output.liveHostNodes ?? [])
							armHostNodes.set(hostNodeId, node);
					armView = marklessCsrBindChunkAnchors(
						armView,
						arm.branchAnchors,
						arm.boundaryAnchors,
					);
					const planned = Array.isArray(boundary.armRecords)
						? boundary.armRecords[status === 'rejected' ? 2 : 0]
						: undefined;
					const prefixHost = (record) => ({
						...record,
						hostNodeId: idPrefix + record.hostNodeId,
					});
					const plannedEvents = (planned?.events ?? []).map((event) => ({
						...prefixHost(event),
						symbolIds: (event.symbolIds ?? []).map(
							(symbolId) => symbolPrefix + marklessCsrChunkLocalSymbolId(symbolId),
						),
					}));
					const liveElements = new Map(armHostNodes);
					return {
						nodes: Array.from(armRoot.childNodes ?? []),
						elementsByHostId: liveElements,
						eventElementsByHostId: armEventElements,
						armRecords: {
							locators: [],
							events: [...armView.events, ...plannedEvents],
							domUpdates: armView.domUpdates,
							behaviors: armView.behaviors,
							elementHandles: armView.elementHandles,
							keyedRepeats: armView.keyedRepeats,
							branches: [...(armView.branches ?? []), ...(planned?.branches ?? [])],
						},
					};
				},
			};
		}),
	};
	const output = {
		root,
		state,
		view,
		elementCount: rendered.hostCount,
		liveHostNodes,
		routePrefixes: childOutputs.flatMap(
			(child) => child.edge.symbolPrefix || child.output.routePrefixes || [],
		),
		symbolIds: new Set([
			...state.computed.map((computed) => computed.deriveSymbolId).filter((symbolId) => symbolId),
			...view.events.flatMap((event) => event.symbolIds ?? []),
			...view.domUpdates.map((update) => update.symbolId).filter((symbolId) => symbolId),
			...view.behaviors.map((behavior) => behavior.symbolId).filter((symbolId) => symbolId),
		]),
		loadSymbol(symbolId) {
			for (const child of symbolRoutes) {
				const prefix = child.edge.symbolPrefix;
				if (
					prefix
						? !symbolId.startsWith(prefix)
						: !child.output.symbolIds?.has(symbolId) &&
							!(child.output.routePrefixes ?? []).some((route) => symbolId.startsWith(route))
				) continue;
				return marklessCsrChunkRemapLoadedSymbol(
					child.output.loadSymbol(prefix ? symbolId.slice(prefix.length) : symbolId),
					child.edge.props,
				);
			}
			return definition.loadSymbol(symbolId);
		},
		loadBehaviorSymbol(symbolId) {
			for (const child of symbolRoutes) {
				const prefix = child.edge.symbolPrefix;
				if (prefix && symbolId.startsWith(prefix))
					return child.output.loadBehaviorSymbol?.(symbolId.slice(prefix.length)) ??
						child.output.loadSymbol(symbolId.slice(prefix.length));
			}
			return definition.loadBehaviorSymbol?.(symbolId) ?? definition.loadSymbol(symbolId);
		},
		connectRuntime(context) {
			runtimeState.graph = context.graph;
			for (const child of childOutputs) child.output.connectRuntime?.(context);
		},
	};
	return output;
}

function collectEventCoordinates(coordinates, hostNodes, idPrefix) {
	for (const [hostNodeId, node] of hostNodes) {
		const nodes = coordinates.get(idPrefix + hostNodeId) ?? [];
		nodes.push(node);
		coordinates.set(idPrefix + hostNodeId, nodes);
	}
}

const marklessCsrNativeDefinitions = new Map();

function marklessCsrNativeDefinition(shell) {
	if (!shell.dataId) return shell;
	let definition = marklessCsrNativeDefinitions.get(shell.dataId);
	if (!definition) {
		const script = document.getElementById?.(shell.dataId);
		if (script) definition = JSON.parse(script.textContent ?? '');
		else if (shell.nativeFallback) return { ...shell.nativeFallback(), ...shell };
		else throw new Error(`Missing Markless CSR native data ${shell.dataId}.`);
		marklessCsrNativeDefinitions.set(shell.dataId, definition);
	}
	return { ...definition, ...shell };
}

// Components reachable only through an inactive branch/async arm still own
// graph definitions that must exist before that arm commits. Build those
// definitions and symbol routes from compiler data only: no component body or
// DOM chunk runs here.
function marklessCsrDeferredChunkOutput(definition, components, depth) {
	definition = marklessCsrNativeDefinition(definition);
	if (depth > 32) throw new Error(`Markless CSR component recursion exceeded at ${definition.name}.`);
	const children = (definition.edges ?? []).flatMap((edge) => {
		const childDefinition = definition.getComponent?.(edge.childComponentName) ?? components[edge.childComponentName];
		return childDefinition
			? [{ edge, output: marklessCsrDeferredChunkOutput(childDefinition, components, depth + 1) }]
			: [];
	});
	const initial = new Map();
	for (const entry of definition.initialValues ?? [])
		if (entry.value.kind === 'constant') initial.set(entry.graphNodeId, entry.value.value);
	const state = marklessCsrChunkState(definition, {}, initial, children);
	state.cells = (state.cells ?? []).filter((cell) => !cell.graphNodeId.startsWith('prop:'));
	const symbolIds = new Set(
		state.computed.flatMap((computed) =>
			computed.deriveSymbolId ? [computed.deriveSymbolId] : [],
		),
	);
	const output = {
		state,
		symbolIds,
		routePrefixes: children.flatMap((child) =>
			child.edge.symbolPrefix ? [child.edge.symbolPrefix] : child.output.routePrefixes ?? [],
		),
		loadSymbol(symbolId) {
			for (const child of children) {
				if (child.edge.symbolPrefix && symbolId.startsWith(child.edge.symbolPrefix))
					return marklessCsrChunkRemapLoadedSymbol(
						child.output.loadSymbol(symbolId.slice(child.edge.symbolPrefix.length)),
						child.edge.props,
					);
				if (!child.edge.symbolPrefix && child.output.symbolIds?.has(symbolId))
					return marklessCsrChunkRemapLoadedSymbol(
						child.output.loadSymbol(symbolId),
						child.edge.props,
					);
			}
			return definition.loadSymbol(symbolId);
		},
	};
	return output;
}

function marklessCsrChunkRemapLoadedSymbol(loaded, graphProps) {
	if (marklessCsrIsThenable(loaded))
		return loaded.then((symbol) => marklessCsrChunkRemapLoadedSymbol(symbol, graphProps));
	if (typeof loaded !== 'function' || !graphProps?.length) return loaded;
	return (context) => loaded({
		...context,
		graph: {
			...context.graph,
			read(graphNodeId, path = []) {
				const mapped = marklessCsrRemapChildGraph({ graphNodeId, path }, graphProps);
				return context.graph.read(mapped?.graphNodeId ?? graphNodeId, mapped?.path ?? path);
			},
		},
	});
}

function marklessCsrChunkNodeAtPath(root, path) {
	let node = root;
	for (const index of path) {
		node = node?.childNodes?.[index];
		if (!node) return undefined;
	}
	return node;
}

function readMarklessCsrChunkPath(value, path = []) {
	for (const segment of path) value = value?.[segment];
	return value;
}

function readMarklessCsrChunkResidue(residue, read, locals, getValues) {
	if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
	if (residue.kind === 'repeat-item') {
		const item = Object.values(locals).find((value) => value && typeof value === 'object');
		return readMarklessCsrChunkPath(item, residue.path);
	}
	return getValues()[residue.source]?.();
}

function stringifyMarklessCsrChunkValue(value) {
	return value == null || value === false ? '' : String(value);
}

function marklessCsrChunkReplace(fragment, target, ...nodes) {
	const expanded = [];
	for (const node of nodes) {
		if (node?.nodeType === 11) expanded.push(...Array.from(node.childNodes ?? []));
		else if (node) expanded.push(node);
	}
	const topLevel = Array.from(fragment.childNodes ?? []);
	const index = topLevel.indexOf(target);
	if (!target.parentNode && !target.parentElement && index >= 0 && Array.isArray(fragment.childNodes))
		fragment.childNodes.splice(index, 1, ...expanded);
	else target.replaceWith?.(...expanded);
}

function marklessCsrChunkAnchors(anchor, kind, id) {
	const start = anchor.cloneNode();
	const end = anchor.cloneNode();
	start.textContent = `markless:${kind}:${id}`;
	end.textContent = `/markless:${kind}:${id}`;
	return { start, end };
}

function countMarklessChunkHostsBefore(chunk, path) {
	return chunk.hosts.filter((host) => compareMarklessChunkPaths(host.coordinate.path, path) < 0)
		.length;
}

function compareMarklessChunkPaths(left, right) {
	const length = Math.min(left.length, right.length);
	for (let index = 0; index < length; index++) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return left.length - right.length;
}

function marklessCsrChunkBranchArm(branch, getValues, read) {
	if (!branch) return 0;
	const evaluated = getValues()[branch.testSource]?.();
	if (branch.kind === 'if') return evaluated ? 0 : 1;
	if (branch.armTests) {
		const found = branch.armTests.findIndex((value) => Object.is(value, evaluated));
		return found < 0 ? branch.armTests.length : found;
	}
	return branch.testReads?.length ? (read(branch.testReads[0].graphNodeId, branch.testReads[0].path) ? 0 : 1) : 0;
}

function marklessCsrChunkChildProps(edge, read, locals, getValues, runtimeState, loadSymbol, projection) {
	const props = {};
	if (projection) props.children = projection;
	else if (edge.projection) props.children = edge.projection;
	for (const prop of edge.props) {
		if (prop.kind === 'graph-reference') props[prop.name] = read(prop.graphNodeId, prop.path);
		else if (prop.kind === 'serializable' && 'value' in prop) props[prop.name] = prop.value;
		else if (prop.kind === 'callback' && prop.symbolId) {
			let invoking = false;
			props[prop.name] = async (...args) => {
				if (invoking) throw new Error(`Markless CSR callback recursion at ${prop.symbolId}.`);
				if (!runtimeState.graph) return;
				invoking = true;
				const loaded = loadSymbol(prop.symbolId);
				const symbol = marklessCsrIsThenable(loaded) ? await loaded : loaded;
				try {
					await symbol({ graph: runtimeState.graph, args, event: args[0], element: runtimeState.root, getElementHandle: () => undefined });
				} finally {
					invoking = false;
				}
			};
		} else props[prop.name] = getValues()[prop.source]?.();
	}
	return props;
}

function marklessCsrChunkState(definition, props, initial, children) {
	const source = definition.state ?? definition.getState?.() ?? { version: 1, cells: [], computed: [] };
	const owned = new Set(definition.stateGraphNodeIds ?? []);
	const cells = (source.cells ?? [])
		.filter((cell) => owned.has(cell.graphNodeId))
		.map((cell) => ({ ...cell }));
	for (const [graphNodeId, directValue] of initial) {
		const cell = cells.find((candidate) => candidate.graphNodeId === graphNodeId);
		if (cell) cell.value = marklessSerializeGraphValue(directValue);
	}
	if (definition.propCellId) cells.push({ graphNodeId: definition.propCellId, directValue: props ?? {} });
	for (const child of children) cells.push(...(child.output.state?.cells ?? []));
	return {
		...source,
		cells,
		computed: [
			...(source.computed ?? []).filter((computed) => owned.has(computed.graphNodeId)),
			...children.flatMap((child) =>
				(child.output.state?.computed ?? []).map((computed) => ({
					...computed,
					...(computed.deriveSymbolId && child.edge.symbolPrefix
						? { deriveSymbolId: child.edge.symbolPrefix + computed.deriveSymbolId }
						: {}),
					dependencies: (computed.dependencies ?? []).map((dependency) => {
						const mapped = marklessCsrRemapChildGraph(dependency, child.edge.props ?? []);
						return mapped ? { ...dependency, graphNodeId: mapped.graphNodeId, path: mapped.path } : dependency;
					}),
				})),
			),
		],
	};
}

function marklessCsrChunkView(definition, placements, children, idPrefix, symbolPrefix, active) {
	const source = definition.view ?? definition.getView?.() ?? {};
	const hostIds = active?.hostNodeIds ?? new Set(definition.hostNodeIds ?? []);
	const repeatIds = active?.repeatIds ?? new Set(definition.repeatIds ?? []);
	const branchIds = active?.branchIds ?? new Set(definition.branchIds ?? []);
	const boundaryIds = active?.boundaryIds ?? new Set(definition.boundaryIds ?? []);
	const prefixHost = (record, prefix = idPrefix) => ({ ...record, hostNodeId: prefix + record.hostNodeId });
	const locators = (source.locators ?? [])
		.filter((record) => hostIds.has(record.hostNodeId))
		.sort((left, right) => left.index - right.index)
		.map((record, index) => prefixHost({ ...record, index }));
	const events = (source.events ?? []).filter((record) => hostIds.has(record.hostNodeId)).map((record) => ({ ...prefixHost(record), symbolIds: (record.symbolIds ?? []).map((id) => symbolPrefix + marklessCsrChunkLocalSymbolId(id)) }));
	const domUpdates = (source.domUpdates ?? []).filter((record) => hostIds.has(record.hostNodeId)).map((record) => ({
		...prefixHost(record),
		...(record.symbolId ? { symbolId: symbolPrefix + marklessCsrChunkLocalSymbolId(record.symbolId) } : {}),
	}));
	const behaviors = (source.behaviors ?? []).filter((record) => hostIds.has(record.hostNodeId)).map((record) => ({
		...prefixHost(record),
		...(record.symbolId ? { symbolId: symbolPrefix + marklessCsrChunkLocalSymbolId(record.symbolId) } : {}),
	}));
	const elementHandles = (source.elementHandles ?? []).filter((record) => hostIds.has(record.hostNodeId)).map((record) => prefixHost(record));
	const keyedRepeats = (source.keyedRepeats ?? [])
		.filter((record) => repeatIds.has(record.id))
		.map((record) => ({
			...record,
			id: idPrefix + record.id,
			parentHostNodeId: idPrefix + record.parentHostNodeId,
			...(record.rowHostNodeId ? { rowHostNodeId: idPrefix + record.rowHostNodeId } : {}),
			rowEvents: (record.rowEvents ?? []).map((event) => ({
				...event,
				symbolIds: (event.symbolIds ?? []).map((id) => symbolPrefix + marklessCsrChunkLocalSymbolId(id)),
			})),
		}));
	const branches = (source.branches ?? []).filter((record) => branchIds.has(record.id)).map((record) => ({
		...record,
		id: idPrefix + record.id,
		...(record.symbolId ? { symbolId: symbolPrefix + marklessCsrChunkLocalSymbolId(record.symbolId) } : {}),
	}));
	const asyncBoundaries = (source.asyncBoundaries ?? []).filter((record) => boundaryIds.has(record.id)).map((record) => ({
		...record,
		id: idPrefix + record.id,
		...(record.symbolId ? { symbolId: symbolPrefix + marklessCsrChunkLocalSymbolId(record.symbolId) } : {}),
	}));
	for (const placement of placements) {
		if (!placement.output) {
			const insertedHostIds = new Set(
				[...(placement.hostNodeIds ?? [])].map((hostNodeId) => idPrefix + hostNodeId),
			);
			const represented = locators.filter((locator) => insertedHostIds.has(locator.hostNodeId)).length;
			const delta = placement.elementCount - represented;
			if (delta > 0)
				for (const locator of locators)
					if (!insertedHostIds.has(locator.hostNodeId) && locator.index >= placement.baseIndex)
						locator.index += delta;
			continue;
		}
		const child = placement.output;
		const graphProps = placement.edge.projection
			? [...(placement.edge.props ?? []), { name: 'children', kind: 'serializable', value: placement.edge.projection }]
			: placement.edge.props ?? [];
		const boundSymbols = placement.edge.boundSymbols ?? {};
		const bindSymbol = (symbolId) => {
			const localSymbolId =
				placement.edge.symbolPrefix && symbolId.startsWith(placement.edge.symbolPrefix)
					? symbolId.slice(placement.edge.symbolPrefix.length)
					: symbolId;
			if (boundSymbols[localSymbolId]) return boundSymbols[localSymbolId];
			for (const edge of definition.edges ?? []) {
				for (const [baseSymbolId, instanceSymbolId] of Object.entries(edge.boundSymbols ?? {})) {
					if (instanceSymbolId === symbolId) return boundSymbols[baseSymbolId] ?? symbolId;
				}
			}
			return symbolId;
		};
		for (const locator of locators)
			if (locator.index >= placement.baseIndex) locator.index += child.elementCount;
		for (const locator of child.view?.locators ?? []) locators.push({ ...locator, index: locator.index + placement.baseIndex });
		events.push(...(child.view?.events ?? []).map((event) => ({
			...event,
			symbolIds: (event.symbolIds ?? []).map(bindSymbol),
		})));
		domUpdates.push(...(child.view?.domUpdates ?? []).flatMap((update) => {
			const mapped = marklessCsrRemapChildDomUpdate(update, graphProps, '');
			return mapped ? [{ ...update, graphNodeId: mapped.graphNodeId, path: mapped.path }] : [];
		}));
		behaviors.push(...(child.view?.behaviors ?? []));
		elementHandles.push(...(child.view?.elementHandles ?? []));
		keyedRepeats.push(...(child.view?.keyedRepeats ?? []).flatMap((repeat) => {
			const mapped = marklessCsrRemapChildKeyedRepeat(repeat, graphProps, '');
			return mapped ? [{ ...repeat, collectionGraphNodeId: mapped.graphNodeId, collectionPath: mapped.path }] : [];
		}));
		branches.push(...(child.view?.branches ?? []).map((branch) => ({
			...branch,
			testReads: marklessCsrRemapChildReads(branch.testReads, graphProps, branch.id),
		})));
		asyncBoundaries.push(...(child.view?.asyncBoundaries ?? []).map((boundary) => ({
			...boundary,
			asyncReads: marklessCsrRemapChildReads(boundary.asyncReads, graphProps, boundary.id),
		})));
	}
	locators.sort((left, right) => left.index - right.index);
	return { ...source, locators, events, domUpdates, behaviors, elementHandles, keyedRepeats, branches, asyncBoundaries };
}

function marklessCsrBindChunkAnchors(view, branchAnchors, boundaryAnchors) {
	const bind = (record, anchors) => {
		const live = anchors.get(record.id);
		return live ? { ...record, startAnchor: live.start, endAnchor: live.end } : record;
	};
	return {
		...view,
		branches: (view.branches ?? []).map((record) => bind(record, branchAnchors)),
		asyncBoundaries: (view.asyncBoundaries ?? []).map((record) =>
			bind(record, boundaryAnchors),
		),
	};
}

function marklessCsrChunkLocalSymbolId(symbolId) {
	return marklessBaseSymbolId(symbolId) ?? symbolId;
}
