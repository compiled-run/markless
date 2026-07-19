export function marklessCsrFragmentFromHtml(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}
export function marklessCsrRootFromHtml(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	const root = template.content.firstElementChild;
	if (!root) throw new Error('Markless CSR template did not create a root element.');
	return root;
}
const MARKLESS_CSR_CALLBACK_PROP = '__marklessCsrCallbackProp';
const MARKLESS_CSR_CALLBACK_DISPATCHED = '__marklessCsrCallbackDispatched';
export function marklessCsrRenderChild(component, props) {
	const callbackProps = {};
	const childProps = { ...props };
	for (const key of Object.keys(childProps)) {
		const value = childProps[key];
		if (typeof value !== 'function') continue;
		const callback = (...args) => value(...args);
		Object.defineProperty(callback, MARKLESS_CSR_CALLBACK_PROP, { value: true });
		callbackProps[key] = callback;
		childProps[key] = callback;
	}
	const output = component?.renderCsr?.(childProps);
	return output && Object.keys(callbackProps).length > 0 ? { ...output, callbackProps } : output;
}
export function marklessCsrReplaceChild(root, index, child) {
	const placeholder = root.querySelector?.(`[data-markless-csr-child="${index}"]`);
	if (placeholder && child) placeholder.replaceWith(child);
	else placeholder?.remove?.();
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
export function marklessCsrAttachPropEvent(root, path, eventName, handler) {
	const element = marklessCsrNodeAtPath(root, path);
	if (!handler || !element?.addEventListener) return;
	if (handler[MARKLESS_CSR_CALLBACK_PROP]) {
		element.addEventListener(eventName, (event) =>
			event?.[MARKLESS_CSR_CALLBACK_DISPATCHED] ? undefined : handler(event),
		);
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			return marklessCsrDebugEvent(root, element, eventName);
		}
		return;
	}
	element.addEventListener(eventName, handler);
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
		return marklessCsrDebugEvent(root, element, eventName);
	}
}
function marklessCsrDebugEvent(root, element, eventName) {
	const rootRef = new WeakRef(root),
		elementRef = new WeakRef(element);
	return import('../debug-channel.ts')
		.then((debug) => {
			const liveRoot = rootRef.deref(),
				liveElement = elementRef.deref();
			if (!liveRoot || !liveElement) return;
			debug.__marklessDebugStartContainer(liveRoot, 'csr');
			debug.__marklessDebugRecordInteraction(liveRoot, liveElement, eventName, {
				kind: 'direct-csr',
				source: 'callback-prop',
			});
		})
		.catch(() => {});
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
						? { deriveSymbolId: child.symbolPrefix + computed.deriveSymbolId }
						: {}),
				})),
			),
		],
		...(sharedDefinitions.length ? { sharedDefinitions } : {}),
	};
}
export function marklessCsrLoadChildSymbol(children, loadSymbol, symbolId) {
	for (const child of children)
		if (symbolId.startsWith(child.symbolPrefix) && child.output?.loadSymbol)
			return child.output.loadSymbol(symbolId.slice(child.symbolPrefix.length));
	return loadSymbol(symbolId);
}
export function marklessCsrRemapGraphOutput(output, graphProps) {
	// A composed CSR prop is the source node's committed mount value. Seed that
	// node before the page graph is built so a downstream-first write can read it.
	const props = output.state.cells.find((cell) =>
		cell.graphNodeId.startsWith('prop:'),
	)?.directValue;
	if (props)
		for (const prop of graphProps ?? [])
			if (!prop.path.length && props[prop.name] !== undefined)
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
export function marklessViewWithoutAnchors(view) {
	return { ...view, branches: [], asyncBoundaries: [] };
}
export function marklessCsrComposeView(root, view, hostLocators, children) {
	marklessCsrProjectCallerHosts(root, hostLocators);
	const elements = marklessCsrCollectElements(root);
	const indexByElement = new Map(elements.map((element, index) => [element, index]));
	const localHostIds = new Set();
	const locators = [];
	const branches = [...(view.branches ?? [])];
	const asyncBoundaries = [...(view.asyncBoundaries ?? [])];
	const asyncRunners = { ...view.asyncRunners };
	const csrCallbacks = new Map();
	for (const locator of hostLocators) {
		const element = marklessCsrNodeAtPath(root, locator.hostPath);
		const index = element ? indexByElement.get(element) : undefined;
		if (index === undefined) continue;
		localHostIds.add(locator.hostNodeId);
		locators.push({
			hostNodeId: locator.hostNodeId,
			strategy: 'dom-order',
			index,
			tagName: locator.tagName,
		});
	}
	const events = view.events.filter((event) => localHostIds.has(event.hostNodeId));
	const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId));
	const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId));
	const elementHandles = view.elementHandles.filter((handle) =>
		localHostIds.has(handle.hostNodeId),
	);
	for (const child of children)
		marklessCsrAppendChildView({
			child,
			elements,
			indexByElement,
			locators,
			events,
			domUpdates,
			behaviors,
			elementHandles,
			branches,
			asyncBoundaries,
			asyncRunners,
			csrCallbacks,
		});
	locators.sort((a, b) => a.index - b.index);
	const armizedBoundaries = marklessCsrArmizeBoundaries(
		root,
		asyncBoundaries,
		{ locators, events, behaviors, elementHandles },
		indexByElement,
	);
	const composed = {
		...view,
		locators,
		events,
		domUpdates,
		behaviors,
		elementHandles,
		branches: marklessCsrResolveAnchorRecords(root, 'branch', branches),
		asyncBoundaries: marklessCsrResolveAnchorRecords(root, 'async', armizedBoundaries),
		...(Object.keys(asyncRunners).length > 0 ? { asyncRunners } : {}),
	};
	return csrCallbacks.size > 0
		? { ...composed, __marklessCsrCallbacks: Object.fromEntries(csrCallbacks) }
		: composed;
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
		context.asyncRunners[mapped?.graphNodeId ?? graphNodeId] =
			context.child.symbolPrefix + symbolId;
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
				: event.symbolIds.map((symbolId) => context.child.symbolPrefix + symbolId),
		});
	}
	for (const update of childView.domUpdates) {
		const mapped = marklessCsrRemapChildGraph(update, context.child.graphProps);
		if (!mapped) continue;
		context.domUpdates.push({
			...update,
			hostNodeId: context.child.hostPrefix + update.hostNodeId,
			graphNodeId: mapped.graphNodeId,
			path: mapped.path,
			...(update.symbolId ? { symbolId: context.child.symbolPrefix + update.symbolId } : {}),
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
				? { symbolId: context.child.symbolPrefix + behavior.symbolId }
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
			...(branch.symbolId ? { symbolId: context.child.symbolPrefix + branch.symbolId } : {}),
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
					? { runnerSymbolId: context.child.symbolPrefix + read.runnerSymbolId }
					: {}),
			})),
			...(boundary.updateSymbolId
				? { updateSymbolId: context.child.symbolPrefix + boundary.updateSymbolId }
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
			symbolIds: (event.symbolIds ?? []).map((symbolId) => child.symbolPrefix + symbolId),
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
			...(behavior.symbolId ? { symbolId: child.symbolPrefix + behavior.symbolId } : {}),
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
							? { symbolId: child.symbolPrefix + branch.symbolId }
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
export function marklessCsrArmizeBoundaries(root, boundaries, streams, indexByElement) {
	return boundaries.map((boundary) => {
		// Child-composed boundaries already carry a single armized record set.
		if (!Array.isArray(boundary.armRecords)) return boundary;
		const armElements = marklessCsrElementsBetweenAnchors(root, 'async', boundary.id);
		if (!armElements) return boundary;
		const start = armElements.length > 0 ? indexByElement.get(armElements[0]) : 0;
		const end = start + armElements.length;
		const armLocators = [];
		for (const element of armElements) {
			const hostNodeId = element.getAttribute?.('data-markless-arm-host');
			if (hostNodeId == null) continue;
			element.removeAttribute('data-markless-arm-host');
			armLocators.push({
				hostNodeId,
				strategy: 'arm-relative',
				index: indexByElement.get(element) - start,
				tagName: element.tagName.toLowerCase(),
			});
		}
		for (let i = streams.locators.length - 1; i >= 0; i--) {
			const locator = streams.locators[i];
			if (locator.index < start || locator.index >= end) continue;
			armLocators.push({
				...locator,
				strategy: 'arm-relative',
				index: locator.index - start,
			});
			streams.locators.splice(i, 1);
		}
		armLocators.sort((a, b) => a.index - b.index);
		const armHostIds = new Set(armLocators.map((locator) => locator.hostNodeId));
		const moved = { events: [], behaviors: [], elementHandles: [] };
		for (const key of Object.keys(moved)) {
			for (let i = streams[key].length - 1; i >= 0; i--) {
				if (armHostIds.has(streams[key][i].hostNodeId))
					moved[key].unshift(...streams[key].splice(i, 1));
			}
		}
		const planned = boundary.armRecords[1] ?? {};
		return {
			...boundary,
			armRecords: {
				locators: armLocators,
				events: [...(planned.events ?? []), ...moved.events],
				behaviors: [...(planned.behaviors ?? []), ...moved.behaviors],
				elementHandles: [...(planned.elementHandles ?? []), ...moved.elementHandles],
				branches: planned.branches ?? [],
			},
		};
	});
}
// Elements strictly between a boundary's live comment anchors, in pre-order
// (the dom-order locator walk). Undefined when the anchor pair is absent.
function marklessCsrElementsBetweenAnchors(root, kind, id) {
	const startText = `markless:${kind}:${id}`;
	const elements = [];
	let within = false;
	let closed = false;
	const visit = (node) => {
		if (closed) return;
		if (node?.nodeType === 8) {
			if (node.textContent === startText) within = true;
			else if (node.textContent === '/' + startText) {
				within = false;
				closed = true;
			}
			return;
		}
		if (within && node?.nodeType === 1) elements.push(node);
		for (const child of Array.from(node?.childNodes ?? [])) visit(child);
	};
	visit(root);
	return closed ? elements : undefined;
}
function marklessCsrProjectCallerHosts(root, hostLocators) {
	for (const locator of hostLocators) {
		if (!locator.hostPath || locator.tagName === '*') continue;
		const element = marklessCsrNodeAtPath(root, locator.hostPath);
		if (!element || marklessCsrTagMatches(element, locator.tagName)) continue;
		if (element.nodeType === 8) continue;
		/* authored slot is a branch/async range start comment: its content lives INSIDE the anchors; projecting would relocate the active arm out of the range and break flips */ const projected =
			marklessCsrFollowingSiblingByTag(element, locator.tagName);
		if (projected && projected.parentNode === element.parentNode)
			element.parentNode?.insertBefore?.(projected, element);
	}
}
function marklessCsrResolveChildLocatorElement(elements, locator, claimed) {
	const current = elements[locator.index];
	if (current && !claimed.has(current) && marklessCsrTagMatches(current, locator.tagName))
		return current;
	return elements.find(
		(element) => !claimed.has(element) && marklessCsrTagMatches(element, locator.tagName),
	);
}
function marklessCsrFollowingSiblingByTag(element, tagName) {
	let sibling = element.nextSibling;
	while (sibling) {
		if (sibling.nodeType === 1 && marklessCsrTagMatches(sibling, tagName)) return sibling;
		sibling = sibling.nextSibling;
	}
	return undefined;
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
	return binding
		? {
				graphNodeId: binding.graphNodeId,
				path: [...binding.path, ...record.path.slice(+whole)],
			}
		: null;
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
			symbolIds: event.symbolIds.map((symbolId) => child.symbolPrefix + symbolId),
		})),
		domUpdates: (arm.domUpdates ?? []).map((update) => {
			const mapped = marklessCsrRemapChildGraph(update, child.graphProps);
			return mapped
				? {
						...update,
						graphNodeId: mapped.graphNodeId,
						path: mapped.path,
						...(update.symbolId
							? { symbolId: child.symbolPrefix + update.symbolId }
							: {}),
					}
				: update;
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
export function marklessCsrResolveAnchorRecords(root, kind, records) {
	if (records.length === 0) return records;
	const comments = [];
	/* arm-branch anchors live in their boundary's own census (T104) */ const visit = (node) => {
		if (node?.nodeType === 8 && !/^\/?markless:arm-branch:/.test(node.textContent ?? ''))
			comments.push(node);
		for (const child of Array.from(node?.childNodes ?? [])) visit(child);
	};
	visit(root);
	const indexByText = new Map();
	comments.forEach((comment, index) => {
		if (!indexByText.has(comment.textContent)) indexByText.set(comment.textContent, index);
	});
	return records.map((record) => {
		const start = indexByText.get(`markless:${kind}:${record.id}`);
		const end = indexByText.get(`/markless:${kind}:${record.id}`);
		if (start === undefined || end === undefined)
			throw new Error(`MARKLESS_COMPOSED_ANCHOR_MISSING: ${kind}:${record.id}`);
		return {
			...record,
			startAnchor: { ...record.startAnchor, index: start },
			endAnchor: { ...record.endAnchor, index: end },
		};
	});
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
export function marklessCsrNodeAtPath(root, path) {
	let node = root;
	for (const index of path) {
		node = marklessCsrAuthoredChild(node, index);
		if (!node) return undefined;
	}
	return node;
}
export function marklessCsrAuthoredChild(parent, index) {
	const children = parent?.childNodes;
	if (!children) return undefined;
	let slot = 0;
	for (let position = 0; position < children.length; position++) {
		const child = children[position];
		if (child.nodeType === 8) {
			const text = child.textContent ?? '';
			const range = /^markless:(branch|arm-branch|async)/.test(text);
			if (range) {
				const end = '/' + text;
				let close = position + 1;
				while (
					close < children.length &&
					!(children[close].nodeType === 8 && children[close].textContent === end)
				)
					close++;
				if (slot === index) return child;
				slot++;
				position = close;
				continue;
			}
			continue;
		}
		if (slot === index) return child;
		slot++;
	}
	return undefined;
}
export function marklessCsrIsThenable(value) {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof value.then === 'function'
	);
}
