import {
	marklessBaseSymbolId,
	marklessBoundSymbolId,
	marklessDomUpdateSymbolId,
	marklessLiveBoundGraphRoute,
} from './bound-symbol.ts';
import { marklessSerializeGraphValue } from './state-serialize.ts';

export function marklessCsrFragmentFromHtml(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}
export function marklessCsrRenderChild(component, props) {
	const callbackProps = {};
	const childProps = { ...props };
	for (const key of Object.keys(childProps)) {
		const value = childProps[key];
		if (typeof value !== 'function') continue;
		const callback = (...args) => value(...args);
		callbackProps[key] = callback;
		childProps[key] = callback;
	}
	const output = component?.renderCsr?.(childProps);
	return output && Object.keys(callbackProps).length > 0 ? { ...output, callbackProps } : output;
}
export function marklessCsrReplaceChild(root, index, child) {
	if (root.getAttribute?.('data-markless-csr-child') === String(index)) {
		return child ?? root;
	}
	const placeholder = root.querySelector?.(`[data-markless-csr-child="${index}"]`);
	if (placeholder && child) placeholder.replaceWith(child);
	else placeholder?.remove?.();
	return root;
}
// Component invocation inside a keyed repeat row (CSR mirror of
// marklessSsrRowChild): rows repeat, so the child contributes markup only and
// interactive child output refuses loudly instead of dying silently (D2).
export function marklessCsrRowChild(component, props, componentName) {
	const output = component?.renderCsr?.(props);
	if (!output) return '';
	marklessCsrAssertPresentationalRowChild(output, componentName);
	const html = output.root?.outerHTML;
	if (typeof html !== 'string') {
		throw Object.assign(
			new Error(
				`MARKLESS_ROW_COMPONENT_INTERACTIVE: <${componentName}> inside a @for row did not produce a serializable root element, so the row cannot render it.`,
			),
			{
				code: 'MARKLESS_ROW_COMPONENT_INTERACTIVE',
				componentName,
			},
		);
	}
	return html;
}
// Component invocation projected through another component's children prop
// (CSR string emission): renders markup only, mirrors marklessCsrRowChild.
export function marklessCsrProjectedChild(component, props, componentName) {
	const output = component?.renderCsr?.(props);
	if (!output) return '';
	marklessCsrAssertPresentationalChild(output, componentName, {
		code: 'MARKLESS_PROJECTED_COMPONENT_INTERACTIVE',
		message: `MARKLESS_PROJECTED_COMPONENT_INTERACTIVE: <${componentName}> is projected through another component's children and renders markup only, but it has its own state, events, or async content, so its interactions cannot resume. Keep projected components presentational (like <Link>), or move them out of the children content.`,
	});
	const html = output.root?.outerHTML;
	if (typeof html !== 'string') {
		throw Object.assign(
			new Error(
				`MARKLESS_PROJECTED_COMPONENT_INTERACTIVE: <${componentName}> projected through another component's children did not produce a serializable root element.`,
			),
			{
				code: 'MARKLESS_PROJECTED_COMPONENT_INTERACTIVE',
				componentName,
			},
		);
	}
	return html;
}
function marklessCsrAssertPresentationalRowChild(output, componentName) {
	marklessCsrAssertPresentationalChild(output, componentName, {
		code: 'MARKLESS_ROW_COMPONENT_INTERACTIVE',
		message: `MARKLESS_ROW_COMPONENT_INTERACTIVE: <${componentName}> inside a @for row has its own state, events, or async content, so its interactions cannot resume. Keep components in @for rows presentational (markup from item props, like <Link>), or move the interactive content out of the row.`,
	});
}
function marklessCsrAssertPresentationalChild(output, componentName, diagnostic) {
	const view = output.view;
	const state = output.state;
	const interactive =
		(view?.events?.length ?? 0) > 0 ||
		(view?.behaviors?.length ?? 0) > 0 ||
		(view?.elementHandles?.length ?? 0) > 0 ||
		(view?.branches?.length ?? 0) > 0 ||
		(view?.asyncBoundaries?.length ?? 0) > 0 ||
		(view?.domUpdates ?? []).some(
			(update) => !String(update.graphNodeId).startsWith('prop:'),
		) ||
		(state?.cells?.length ?? 0) > 0 ||
		(state?.computed?.length ?? 0) > 0 ||
		(output.propEvents?.length ?? 0) > 0;
	if (!interactive) return;
	throw Object.assign(new Error(diagnostic.message), {
		code: diagnostic.code,
		severity: 'error',
		phase: 'runtime',
		componentName,
		docsUrl: `https://markless.dev/errors/${diagnostic.code}`,
	});
}
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
export function marklessCsrAppendChildView(context) {
	const childView = context.child.output?.view;
	const childRoot = context.child.output?.root;
	if (!childView || !childRoot) return;
	const childElements = marklessCsrCollectElements(childRoot);
	const claimed = new Set();
	const propEvents = context.child.output?.propEvents ?? [];
	const callbackProps = context.child.output?.callbackProps ?? {};
	for (const [graphNodeId, symbolId] of Object.entries(childView.asyncRunners ?? {})) {
		const mapped = marklessCsrRemapChildGraph(
			{ graphNodeId, path: [] },
			context.child.graphProps,
		);
		context.asyncRunners[mapped?.graphNodeId ?? graphNodeId] = marklessBoundSymbolId(
			context.child,
			symbolId,
		);
	}
	for (const locator of childView.locators) {
		const element = marklessCsrResolveChildLocatorElement(childElements, locator, claimed);
		const index = element ? context.indexByElement.get(element) : undefined;
		if (index === undefined) continue;
		claimed.add(element);
		context.locators.push({
			...locator,
			hostNodeId: context.child.hostPrefix + locator.hostNodeId,
			index,
		});
	}
	for (const event of childView.events) {
		const propEvent = propEvents.find(
			(item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName,
		);
		const callback = propEvent ? callbackProps[propEvent.propName] : undefined;
		const callbackSymbolId =
			typeof callback === 'function'
				? `csr-callback:${context.child.hostPrefix}${event.hostNodeId}:${event.eventName}:${propEvent.propName}`
				: undefined;
		if (callbackSymbolId) context.csrCallbacks.set(callbackSymbolId, callback);
		context.events.push({
			...event,
			hostNodeId: context.child.hostPrefix + event.hostNodeId,
			symbolIds: callbackSymbolId
				? [callbackSymbolId]
				: event.symbolIds.map((symbolId) => marklessBoundSymbolId(context.child, symbolId)),
		});
	}
	for (const update of childView.domUpdates) {
		const mapped = marklessCsrRemapChildDomUpdate(
			update,
			context.child.graphProps,
			context.child.hostPrefix,
		);
		if (!mapped) continue;
		context.domUpdates.push({
			...update,
			hostNodeId: context.child.hostPrefix + update.hostNodeId,
			graphNodeId: mapped.graphNodeId,
			path: mapped.path,
			...(update.symbolId
				? { symbolId: marklessDomUpdateSymbolId(context.child, update.symbolId) }
				: {}),
		});
	}
	for (const repeat of childView.keyedRepeats ?? []) {
		const mapped = marklessCsrRemapChildKeyedRepeat(
			repeat,
			context.child.graphProps,
			context.child.hostPrefix,
		);
		if (!mapped) continue;
		context.keyedRepeats.push({
			...repeat,
			id: context.child.hostPrefix + repeat.id,
			parentHostNodeId: context.child.hostPrefix + repeat.parentHostNodeId,
			collectionGraphNodeId: mapped.graphNodeId,
			collectionPath: mapped.path,
			rowEvents: repeat.rowEvents.map((event) => ({
				...event,
				symbolIds: event.symbolIds.map((symbolId) =>
					marklessBoundSymbolId(context.child, symbolId),
				),
			})),
		});
	}
	for (const behavior of childView.behaviors)
		context.behaviors.push({
			...behavior,
			hostNodeId: context.child.hostPrefix + behavior.hostNodeId,
			...(behavior.inputGraphReads
				? {
						inputGraphReads: behavior.inputGraphReads.map((read) => {
							const mapped = marklessCsrRemapChildGraph(
								read,
								context.child.graphProps,
							);
							return mapped
								? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }
								: read;
						}),
					}
				: {}),
			...(behavior.symbolId
				? { symbolId: marklessBoundSymbolId(context.child, behavior.symbolId) }
				: {}),
		});
	for (const handle of childView.elementHandles)
		context.elementHandles.push({
			...handle,
			hostNodeId: context.child.hostPrefix + handle.hostNodeId,
		});
	for (const branch of childView.branches ?? []) {
		const prefixedId = context.child.hostPrefix + branch.id;
		marklessCsrRenameAnchors(childRoot, 'branch', branch.id, prefixedId);
		context.branches.push({
			...branch,
			id: prefixedId,
			sourceId: branch.sourceId ?? branch.id,
			testReads: marklessCsrRemapChildReads(
				branch.testReads,
				context.child.graphProps,
				prefixedId,
			),
			...(branch.symbolId
				? { symbolId: marklessBoundSymbolId(context.child, branch.symbolId) }
				: {}),
			...(branch.armRecords
				? {
						armRecords: branch.armRecords.map((arm) =>
							marklessCsrPrefixArmRecord(arm, context.child),
						),
					}
				: {}),
		});
	}
	for (const boundary of childView.asyncBoundaries ?? []) {
		const prefixedId = context.child.hostPrefix + boundary.id;
		marklessCsrRenameAnchors(childRoot, 'async', boundary.id, prefixedId);
		context.asyncBoundaries.push({
			...boundary,
			id: prefixedId,
			asyncReads: marklessCsrRemapChildReads(
				boundary.asyncReads,
				context.child.graphProps,
				prefixedId,
			).map((read) => ({
				...read,
				...(read.runnerSymbolId
					? { runnerSymbolId: marklessBoundSymbolId(context.child, read.runnerSymbolId) }
					: {}),
			})),
			...(boundary.updateSymbolId
				? { updateSymbolId: marklessBoundSymbolId(context.child, boundary.updateSymbolId) }
				: {}),
			...(boundary.armRecords && !Array.isArray(boundary.armRecords)
				? {
						armRecords: marklessCsrPrefixBoundaryArmRecords(
							boundary.armRecords,
							context.child,
						),
					}
				: {}),
		});
	}
}
// A child boundary's armized record set keeps its arm-relative coordinates
// through composition (the anchor is located live at resume); only host ids,
// symbol ids, and behavior graph reads take the child prefixes/remaps
// (CSR twin of marklessSsrPrefixBoundaryArmRecords).
export function marklessCsrPrefixBoundaryArmRecords(set, child) {
	const prefixHost = (record) => ({
		...record,
		hostNodeId: child.hostPrefix + record.hostNodeId,
	});
	return {
		locators: (set.locators ?? []).map(prefixHost),
		events: (set.events ?? []).map((event) => ({
			...prefixHost(event),
			symbolIds: (event.symbolIds ?? []).map((symbolId) =>
				marklessBoundSymbolId(child, symbolId),
			),
		})),
		behaviors: (set.behaviors ?? []).map((behavior) => ({
			...prefixHost(behavior),
			...(behavior.inputGraphReads
				? {
						inputGraphReads: behavior.inputGraphReads.map((read) => {
							const mapped = marklessCsrRemapChildGraph(read, child.graphProps);
							return mapped
								? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }
								: read;
						}),
					}
				: {}),
			...(behavior.symbolId
				? { symbolId: marklessBoundSymbolId(child, behavior.symbolId) }
				: {}),
		})),
		elementHandles: (set.elementHandles ?? []).map(prefixHost),
		...(set.branches
			? {
					branches: set.branches.map((branch) => ({
						...branch,
						id: child.hostPrefix + branch.id,
						testReads: marklessCsrRemapChildReads(
							branch.testReads,
							child.graphProps,
							child.hostPrefix + branch.id,
						),
						...(branch.symbolId
							? { symbolId: marklessBoundSymbolId(child, branch.symbolId) }
							: {}),
						...(branch.armRecords
							? {
									armRecords: branch.armRecords.map((arm) =>
										marklessCsrPrefixArmRecord(arm, child),
									),
								}
							: {}),
					})),
				}
			: {}),
	};
}
// D3 arm-relative coordinates for CSR mounts (mirror of
// marklessSsrArmizeBoundaries against the live DOM): the compiler's per-arm
// record arrays are not positionally trustworthy after composition, so the
// rendered @pending arm is the truth. Its own hosts carry
// data-markless-arm-host tags from the compiled module; composed children
// inside the arm move here from the flat streams. The result is ONE
// registrable arm-relative record set per boundary — CSR mounts always
// render @pending, so the planned records merged in are arm 1's.
function marklessCsrResolveChildLocatorElement(elements, locator, claimed) {
	const current = elements[locator.index];
	if (current && !claimed.has(current) && marklessCsrTagMatches(current, locator.tagName))
		return current;
	return elements.find(
		(element) => !claimed.has(element) && marklessCsrTagMatches(element, locator.tagName),
	);
}
function marklessCsrTagMatches(element, tagName) {
	return tagName === '*' || element?.tagName?.toLowerCase?.() === String(tagName).toLowerCase();
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
export function marklessCsrPrefixArmRecord(arm, child) {
	return {
		...arm,
		events: (arm.events ?? []).map((event) => ({
			...event,
			symbolIds: event.symbolIds.map((symbolId) => marklessBoundSymbolId(child, symbolId)),
		})),
		domUpdates: (arm.domUpdates ?? []).flatMap((update) => {
			const mapped = marklessCsrRemapChildDomUpdate(
				update,
				child.graphProps,
				child.hostPrefix,
			);
			return mapped
				? [{
						...update,
						graphNodeId: mapped.graphNodeId,
						path: mapped.path,
						...(update.symbolId
							? { symbolId: marklessDomUpdateSymbolId(child, update.symbolId) }
							: {}),
					}]
				: [];
		}),
	};
}
export function marklessCsrRenameAnchors(root, kind, id, prefixedId) {
	const visit = (node) => {
		if (node?.nodeType === 8) {
			if (node.textContent === `markless:${kind}:${id}`)
				node.textContent = `markless:${kind}:${prefixedId}`;
			if (node.textContent === `/markless:${kind}:${id}`)
				node.textContent = `/markless:${kind}:${prefixedId}`;
		}
		for (const child of Array.from(node?.childNodes ?? [])) visit(child);
	};
	visit(root);
}
export function marklessCsrCollectElements(root) {
	const elements = [];
	const visit = (node) => {
		if (node?.nodeType === 1) elements.push(node);
		for (const child of Array.from(node?.childNodes ?? [])) visit(child);
	};
	visit(root);
	return elements;
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
		return renderChunkComponent(definition, props, input.components, '', '', 0);
	};
}

function renderChunkComponent(definition, props, components, idPrefix, symbolPrefix, depth) {
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
			template = document.createElement('template');
			template.innerHTML = chunk.statics.join('');
			templates.set(chunkId, template);
		}
		return { chunk, content: template.content.cloneNode(true) };
	};

	const renderChunk = (chunkId, locals = {}) => {
		const cloned = cloneChunk(chunkId);
		const hostNodes = new Map(
			cloned.chunk.hosts.flatMap((host) => {
				const node = marklessCsrChunkNodeAtPath(cloned.content, host.coordinate.path);
				return node?.nodeType === 1 ? [[host.hostNodeId, node]] : [];
			}),
		);
		const renderedHostNodeIds = new Set(cloned.chunk.hosts.map((host) => host.hostNodeId));
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
					value?.kind === 'static-markup' ||
					(typeof value === 'string' && slot.residue?.kind === 'graph-read' && slot.residue.path?.[0] === 'children')
				) {
					const projection = document.createElement('template');
					projection.innerHTML = value?.kind === 'static-markup' ? value.markup : value;
					marklessCsrChunkReplace(target, projection.content);
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
				const childProps = marklessCsrChunkChildProps(edge, read, locals, getValues, runtimeState, definition.loadSymbol);
				const child = renderChunkComponent(
					childDefinition,
					childProps,
					components,
					idPrefix + edge.hostPrefix,
					symbolPrefix + edge.symbolPrefix,
					depth + 1,
				);
				if (!child) {
					target.remove?.();
					continue;
				}
				marklessCsrChunkReplace(target, child.root);
				placements.push({ edge, output: child, baseIndex });
				childOutputs.push({ edge, output: child });
				insertedHosts += child.elementCount;
				continue;
			}
			if (slot.kind === 'repeat') {
				const repeat = definition.repeats.find((candidate) => candidate.repeatId === slot.repeatId);
				const collection = repeat?.collectionGraphNodeId
					? read(repeat.collectionGraphNodeId, repeat.collectionPath)
					: [];
				const rows = Array.isArray(collection) ? collection : Array.from(collection ?? []);
				const nodes = [];
				let hostCount = 0;
				const rowHostNodeIds = new Set();
				if (rows.length === 0 && slot.emptyTemplateId) {
					const empty = renderChunk(slot.emptyTemplateId, locals);
					nodes.push(...empty.nodes);
					hostCount += empty.hostCount;
					for (const [hostNodeId, node] of empty.hostNodes) hostNodes.set(hostNodeId, node);
					for (const hostNodeId of empty.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
					for (const hostNodeId of empty.hostNodeIds) rowHostNodeIds.add(hostNodeId);
				} else {
					for (const item of rows) {
						const row = renderChunk(slot.rowTemplateId, { ...locals, [repeat.itemName]: item });
						nodes.push(...row.nodes);
						hostCount += row.hostCount;
						for (const [hostNodeId, node] of row.hostNodes) hostNodes.set(hostNodeId, node);
						for (const hostNodeId of row.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
						for (const hostNodeId of row.hostNodeIds) rowHostNodeIds.add(hostNodeId);
					}
				}
				marklessCsrChunkReplace(target, ...nodes);
				placements.push({ baseIndex, elementCount: hostCount, hostNodeIds: rowHostNodeIds });
				insertedHosts += hostCount;
				continue;
			}
			if (slot.kind === 'branch') {
				const branch = definition.branches.find((candidate) => candidate.branchSiteId === slot.branchSiteId);
				const taken = marklessCsrChunkBranchArm(branch, getValues, read);
				const arm = renderChunk(slot.armTemplateIds[taken] ?? slot.armTemplateIds[0], locals);
				for (const [hostNodeId, node] of arm.hostNodes) hostNodes.set(hostNodeId, node);
				for (const hostNodeId of arm.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				const anchors = marklessCsrChunkAnchors(target, 'branch', idPrefix + slot.branchSiteId);
				marklessCsrChunkReplace(target, anchors.start, ...arm.nodes, anchors.end);
				placements.push({ baseIndex, elementCount: arm.hostCount, hostNodeIds: arm.hostNodeIds });
				insertedHosts += arm.hostCount;
				continue;
			}
			if (slot.kind === 'async') {
				const chunkId = slot.armTemplateIds.pending ?? slot.armTemplateIds.try;
				const arm = renderChunk(chunkId, locals);
				for (const [hostNodeId, node] of arm.hostNodes) hostNodes.set(hostNodeId, node);
				for (const hostNodeId of arm.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				const anchors = marklessCsrChunkAnchors(target, 'async', idPrefix + slot.boundaryId);
				marklessCsrChunkReplace(target, anchors.start, ...arm.nodes, anchors.end);
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
				const children = renderChunk(slot.childChunkId, locals);
				for (const hostNodeId of children.hostNodeIds) renderedHostNodeIds.add(hostNodeId);
				for (const node of children.nodes) host.appendChild(node);
				marklessCsrChunkReplace(target, host);
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
		};
	};

	const rendered = renderChunk(definition.rootChunkId);
	const root = rendered.nodes.length === 1
		? rendered.nodes[0]
		: rendered.content;
	if (!root) throw new Error('Markless CSR chunk did not create a root.');
	runtimeState.root = root;
	const state = marklessCsrChunkState(definition, props, initial, childOutputs);
	let view = marklessCsrChunkView(
		definition,
		rendered.placements,
		childOutputs,
		idPrefix,
		symbolPrefix,
		activeHostNodeIds,
	);
	const liveHostNodes = new Map(
		[...rendered.hostNodes].map(([hostNodeId, node]) => [idPrefix + hostNodeId, node]),
	);
	for (const child of childOutputs)
		for (const [hostNodeId, node] of child.output.liveHostNodes ?? [])
			liveHostNodes.set(hostNodeId, node);
	view = marklessCsrBindChunkView(root, view, liveHostNodes);
	const output = {
		root,
		state,
		view,
		elementCount: rendered.hostCount,
		liveHostNodes,
		routePrefixes: childOutputs.flatMap((child) =>
			child.edge.symbolPrefix
				? [child.edge.symbolPrefix]
				: child.output.routePrefixes ?? [],
		),
		symbolIds: new Set([
			...state.computed.flatMap((computed) => computed.deriveSymbolId ? [computed.deriveSymbolId] : []),
			...view.events.flatMap((event) => event.symbolIds ?? []),
			...view.domUpdates.flatMap((update) => update.symbolId ? [update.symbolId] : []),
			...view.behaviors.flatMap((behavior) => behavior.symbolId ? [behavior.symbolId] : []),
		]),
		loadSymbol(symbolId) {
			for (const child of childOutputs) {
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
				if (
					!child.edge.symbolPrefix &&
					(child.output.routePrefixes ?? []).some((prefix) => symbolId.startsWith(prefix))
				) return marklessCsrChunkRemapLoadedSymbol(
					child.output.loadSymbol(symbolId),
					child.edge.props,
				);
			}
			return definition.loadSymbol(symbolId);
		},
		connectRuntime(context) {
			runtimeState.graph = context.graph;
			for (const child of childOutputs) child.output.connectRuntime?.(context);
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

function marklessCsrChunkReplace(target, ...nodes) {
	const expanded = [];
	for (const node of nodes) {
		if (node?.nodeType === 11) expanded.push(...Array.from(node.childNodes ?? []));
		else if (node) expanded.push(node);
	}
	target.replaceWith?.(...expanded);
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

function marklessCsrChunkChildProps(edge, read, locals, getValues, runtimeState, loadSymbol) {
	const props = {};
	if (edge.projection) props.children = edge.projection;
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
	const source = definition.getState?.() ?? { version: 1, cells: [], computed: [] };
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

function marklessCsrChunkView(definition, placements, children, idPrefix, symbolPrefix, activeHostNodeIds) {
	const source = definition.getView?.() ?? {};
	const hostIds = activeHostNodeIds ?? new Set(definition.hostNodeIds ?? []);
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
		.filter((record) => definition.repeatIds.includes(record.id))
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
	const branches = (source.branches ?? []).filter((record) => definition.branchIds.includes(record.id)).map((record) => ({
		...record,
		id: idPrefix + record.id,
		...(record.symbolId ? { symbolId: symbolPrefix + marklessCsrChunkLocalSymbolId(record.symbolId) } : {}),
	}));
	const asyncBoundaries = (source.asyncBoundaries ?? []).filter((record) => definition.boundaryIds.includes(record.id)).map((record) => ({
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

// Render-data coordinates identify nodes inside the template clone. Materialize
// those identities after every slot/component insertion, then translate them
// back to the public dom-order records handed to the runtime. Payload indexes
// describe the uncomposed template and must not be used as a substitute for
// binding the mounted clone.
function marklessCsrBindChunkView(root, view, liveHostNodes) {
	const elements = marklessCsrCollectElements(root);
	const indexByElement = new Map(elements.map((element, index) => [element, index]));
	const locators = view.locators.map((locator) => {
		const element = liveHostNodes.get(locator.hostNodeId);
		const index = element ? indexByElement.get(element) : undefined;
		return index === undefined ? locator : { ...locator, index };
	});
	locators.sort((left, right) => left.index - right.index);

	const comments = [];
	const commentIndexByText = new Map();
	const visit = (node) => {
		if (node?.nodeType === 8) {
			const text = node.data ?? node.textContent ?? '';
			if (!text.startsWith('markless:arm-branch:') && !text.startsWith('/markless:arm-branch:')) {
				commentIndexByText.set(text, comments.length);
				comments.push(node);
			}
		}
		for (const child of Array.from(node?.childNodes ?? [])) visit(child);
	};
	visit(root);
	const bindAnchors = (record, kind) => {
		const start = commentIndexByText.get(`markless:${kind}:${record.id}`);
		const end = commentIndexByText.get(`/markless:${kind}:${record.id}`);
		return start === undefined || end === undefined
			? record
			: {
					...record,
					startAnchor: { ...record.startAnchor, index: start },
					endAnchor: { ...record.endAnchor, index: end },
				};
	};
	return {
		...view,
		locators,
		branches: (view.branches ?? []).map((record) => bindAnchors(record, 'branch')),
		asyncBoundaries: (view.asyncBoundaries ?? []).map((record) => bindAnchors(record, 'async')),
	};
}

function marklessCsrChunkLocalSymbolId(symbolId) {
	return marklessBaseSymbolId(symbolId) ?? symbolId;
}
