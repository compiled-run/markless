export async function marklessSsrRenderChild(children, component, props, child, renderContext) {
	const output = await component?.renderSsr?.(props, renderContext);
	if (!output) return '';
	let html = output.html ?? '';
	for (const branch of output.view?.branches ?? [])
		html = marklessSsrPrefixAnchorHtml(html, 'branch', branch.id, child.hostPrefix + branch.id);
	for (const boundary of output.view?.asyncBoundaries ?? [])
		html = marklessSsrPrefixAnchorHtml(
			html,
			'async',
			boundary.id,
			child.hostPrefix + boundary.id,
		);
	const entry = {
		...child,
		output: { ...output, html },
		callbackProps: props?.__marklessSsrCallbacks ?? {},
	};
	// Viewless children (router <Link>-style: renderSsr returns { html } only)
	// still render real elements that later dom-order locators must skip.
	// Their own element count is the rendered html minus the caller's projected
	// children content (those hosts already entered the caller's locator stream
	// during prop evaluation).
	if (entry.output.view === undefined && entry.output.elementCount === undefined) {
		entry.output.elementCount = Math.max(
			0,
			marklessSsrCountElementOpens(html) - marklessSsrCountElementOpens(props?.children),
		);
	}
	children.push(entry);
	return html;
}
export function marklessSsrCountElementOpens(html) {
	return (String(html ?? '').match(/<[a-zA-Z]/g) ?? []).length;
}
// Component invocation inside a keyed repeat row: rows repeat, so no composed
// child record can exist — the child contributes MARKUP ONLY. Interactive
// child output (own state, events, async content) would silently die after
// resume, so it refuses loudly instead (D2). Prop-keyed dom updates are
// allowed: prop values are static per row instance.
export async function marklessSsrRowChild(component, props, componentName) {
	const output = await component?.renderSsr?.(props);
	if (!output) return '';
	marklessAssertPresentationalRowChild(output, componentName);
	return output.html ?? '';
}
export function marklessAssertPresentationalRowChild(output, componentName) {
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
	const message = `MARKLESS_ROW_COMPONENT_INTERACTIVE: <${componentName}> inside a @for row has its own state, events, or async content, so its interactions cannot resume. Keep components in @for rows presentational (markup from item props, like <Link>), or move the interactive content out of the row.`;
	const error = new Error(message);
	error.code = 'MARKLESS_ROW_COMPONENT_INTERACTIVE';
	error.severity = 'error';
	error.phase = 'runtime';
	error.componentName = componentName;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_ROW_COMPONENT_INTERACTIVE';
	throw error;
}
export function marklessSsrBranchArm(branches, id, takenArm) {
	branches.push({ id, takenArm });
	return '';
}
export async function marklessSsrRunAsyncComputed(
	snapshots,
	graphNodeId,
	run,
	renderContext,
	hasPendingArm,
) {
	// Streaming mode (T107, owner-ratified three-layer semantics): the render
	// context carries a per-request runner registry. run() executes ONCE per
	// graph node across streaming passes; re-render passes reuse the in-flight
	// promise. Boundary tier: an authored @pending arm IS the streaming opt-in
	// (hasPendingArm) — a @try without @pending HOLDS the stream (awaits).
	// Per-request tier: runners get until the shared first-flush deadline to
	// settle inline; only still-pending boundaries stream.
	const streaming = renderContext?.streaming;
	if (streaming?.runs) {
		let entry = streaming.runs.get(graphNodeId);
		if (!entry) {
			entry = { promise: marklessSsrSettleAsyncComputed(run) };
			entry.promise.then((settledSnapshot) => {
				entry.settled = settledSnapshot;
			});
			streaming.runs.set(graphNodeId, entry);
		}
		// Discovery pass (C1 parallel runner starts): the first streaming pass
		// only STARTS runners — it never awaits one and never consumes the
		// first-flush deadline, so every boundary's runner is in flight before
		// the real render pass races any of them against the shared deadline.
		if (streaming.prestart) {
			const snapshot = entry.settled ?? { status: 'pending', version: 1, key: null };
			snapshots.push({ graphNodeId, snapshot });
			return snapshot;
		}
		if (!entry.settled) {
			if (hasPendingArm !== true) await entry.promise;
			else if (streaming.deadline) await Promise.race([entry.promise, streaming.deadline]);
		}
		const snapshot = entry.settled ?? { status: 'pending', version: 1, key: null };
		snapshots.push({ graphNodeId, snapshot });
		return snapshot;
	}
	const snapshot = await marklessSsrSettleAsyncComputed(run);
	snapshots.push({ graphNodeId, snapshot });
	return snapshot;
}
async function marklessSsrSettleAsyncComputed(run) {
	const signal = new AbortController().signal;
	try {
		const value = await run({ key: null, signal });
		return { status: 'fulfilled', version: 1, key: null, value };
	} catch (error) {
		return { status: 'rejected', version: 1, key: null, error };
	}
}
export function marklessSsrAttachSnapshots(state, snapshots) {
	if (snapshots.length === 0) return state;
	const byId = new Map(snapshots.map((entry) => [entry.graphNodeId, entry.snapshot]));
	return {
		...state,
		computed: (state.computed ?? []).map((computed) =>
			byId.has(computed.graphNodeId)
				? { ...computed, snapshot: byId.get(computed.graphNodeId) }
				: computed,
		),
	};
}
export function marklessSsrMergeBranches(payloadBranches, runtimeBranches) {
	const takenById = new Map(runtimeBranches.map((branch) => [branch.id, branch.takenArm]));
	return (payloadBranches ?? []).map((branch) =>
		takenById.has(branch.id) ? { ...branch, takenArm: takenById.get(branch.id) } : branch,
	);
}
export function marklessSsrArmHost(hostLocators) {
	hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + 1;
	return '';
}
export function marklessSsrHost(hostLocators, hostNodeId, tagName) {
	hostLocators.push({
		hostNodeId,
		strategy: 'dom-order',
		index: hostLocators.length + (hostLocators.marklessSsrExtraElements ?? 0),
		tagName,
	});
	return '';
}
export function marklessSsrCallbacks(callbacks) {
	const result = {};
	for (const key of Object.keys(callbacks)) if (callbacks[key]) result[key] = callbacks[key];
	return result;
}
export function marklessSsrCallbackSymbol(props, path) {
	let value = props?.__marklessSsrCallbacks;
	for (const key of path) value = value?.[key];
	return typeof value === 'string' ? value : undefined;
}
export function marklessComposeState(state, children) {
	const childStates = children.map((child) => child.output?.state).filter(Boolean);
	if (childStates.length === 0) return state;
	marklessAssertComposableStateNames(state, childStates);
	return {
		...state,
		cells: [
			...(state.cells ?? []),
			...childStates.flatMap((childState) => childState.cells ?? []),
		],
		computed: [
			...(state.computed ?? []),
			...children.flatMap((child) =>
				(child.output?.state?.computed ?? []).map((computed) =>
					typeof computed.deriveSymbolId === 'string'
						? {
								...computed,
								deriveSymbolId: child.symbolPrefix + computed.deriveSymbolId,
							}
						: computed,
				),
			),
		],
		...(state.sharedDefinitions ||
		childStates.some((childState) => childState.sharedDefinitions?.length)
			? {
					sharedDefinitions: [
						...(state.sharedDefinitions ?? []),
						...childStates.flatMap((childState) => childState.sharedDefinitions ?? []),
					],
				}
			: {}),
	};
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
			// Shared definitions and props compose by design; compiler-synthesized
			// names (computed:templateExpression:0) carry extra ':' segments and
			// repeat in ~every module — their sharing is the ledgered
			// instance-scoped-graph-ids follow-on, not an author collision.
			if (
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
export function marklessSsrComposeView(html, view, hostLocators, children, asyncSnapshots) {
	const localHostIds = new Set(hostLocators.map((locator) => locator.hostNodeId));
	const childData = children
		.map((child) => ({
			...child,
			view: child.output?.view,
			hostCount: child.output?.elementCount ?? child.output?.view?.locators?.length ?? 0,
			externalSymbolIds: new Set(child.output?.externalSymbolIds ?? []),
		}))
		.filter((child) => child.view || child.hostCount > 0);
	marklessSsrDeriveChildPositions(html, childData);
	const offsetFor = (index) =>
		childData.reduce(
			(total, child) => total + (child.localIndex <= index ? child.hostCount : 0),
			0,
		);
	const locators = hostLocators.map((locator) => ({
		...locator,
		index: locator.index + offsetFor(locator.index),
	}));
	const events = view.events.filter((event) => localHostIds.has(event.hostNodeId));
	const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId));
	const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId));
	const elementHandles = view.elementHandles.filter((handle) =>
		localHostIds.has(handle.hostNodeId),
	);
	const branches = [...(view.branches ?? [])];
	const asyncBoundaries = [...(view.asyncBoundaries ?? [])];
	const externalSymbolIds = new Set();
	let inserted = 0;
	for (const child of childData) {
		if (child.view)
			marklessSsrAppendChildView({
				child,
				baseIndex: child.localIndex + inserted,
				locators,
				events,
				domUpdates,
				behaviors,
				elementHandles,
				branches,
				asyncBoundaries,
				externalSymbolIds,
			});
		inserted += child.hostCount;
	}
	locators.sort((a, b) => a.index - b.index);
	const armizedBoundaries = marklessSsrArmizeBoundaries(
		html,
		marklessSsrResolveAnchorRecords(html, 'async', asyncBoundaries),
		{ locators, events, behaviors, elementHandles },
		asyncSnapshots,
	);
	return {
		view: {
			...view,
			locators,
			events,
			domUpdates,
			behaviors,
			elementHandles,
			branches: marklessSsrResolveAnchorRecords(html, 'branch', branches),
			asyncBoundaries: armizedBoundaries,
		},
		elementCount:
			hostLocators.length +
			(hostLocators.marklessSsrExtraElements ?? 0) +
			childData.reduce((total, child) => total + child.hostCount, 0),
		externalSymbolIds: [...externalSymbolIds],
	};
}
// D3 arm-relative coordinates: the rendered html is the truth for which arm a
// boundary served and where its elements sit. Element opens before the start
// anchor give the arm's page offset; every flat record between the anchor
// pair moves into boundary.armRecords with anchor-relative indexes, and the
// taken arm's compile-time record set (events/behaviors/handles keyed by
// hostNodeId) merges in. Composed children inside arms are covered by the
// same positional move, so no page-absolute offset surgery remains for arms.
export function marklessSsrArmizeBoundaries(html, boundaries, streams, asyncSnapshots) {
	if (typeof html !== 'string' || boundaries.length === 0) return boundaries;
	const opensBeforeComment = [];
	const pattern = /<!--([\s\S]*?)-->/g;
	let match;
	while ((match = pattern.exec(html)) !== null) {
		// Arm-branch anchors live in their boundary's own census (T104): the
		// page-level comment census never counts them.
		if (marklessSsrIsArmBranchAnchor(match[1])) continue;
		opensBeforeComment.push((html.slice(0, match.index).match(/<[a-zA-Z]/g) ?? []).length);
	}
	const snapshotById = new Map(
		(asyncSnapshots ?? []).map((entry) => [entry.graphNodeId, entry.snapshot]),
	);
	return boundaries.map((boundary) => {
		// Child-composed boundaries already carry a single armized record set;
		// arm-relative coordinates survive composition untouched.
		if (!Array.isArray(boundary.armRecords)) return boundary;
		const opensStart = opensBeforeComment[boundary.startAnchor.index];
		const opensEnd = opensBeforeComment[boundary.endAnchor.index];
		if (opensStart === undefined || opensEnd === undefined) return boundary;
		const armLocators = [];
		for (let i = streams.locators.length - 1; i >= 0; i--) {
			const locator = streams.locators[i];
			if (locator.index < opensStart || locator.index >= opensEnd) continue;
			armLocators.unshift({
				...locator,
				strategy: 'arm-relative',
				index: locator.index - opensStart,
			});
			streams.locators.splice(i, 1);
		}
		const armHostIds = new Set(armLocators.map((locator) => locator.hostNodeId));
		const moved = { events: [], behaviors: [], elementHandles: [] };
		for (const key of Object.keys(moved)) {
			for (let i = streams[key].length - 1; i >= 0; i--) {
				if (armHostIds.has(streams[key][i].hostNodeId))
					moved[key].unshift(...streams[key].splice(i, 1));
			}
		}
		const status = snapshotById.get(boundary.asyncReads?.[0]?.graphNodeId)?.status;
		const takenArm = status === 'fulfilled' ? 0 : status === 'rejected' ? 2 : 1;
		const planned = boundary.armRecords[takenArm] ?? {};
		return {
			...boundary,
			armRecords: {
				locators: armLocators,
				events: [...(planned.events ?? []), ...moved.events],
				behaviors: [...(planned.behaviors ?? []), ...moved.behaviors],
				elementHandles: [...(planned.elementHandles ?? []), ...moved.elementHandles],
				// Arm-scoped branch records (flips + escalations) ride the taken
				// arm's planned set; resume resolves their anchors arm-locally.
				branches: planned.branches ?? [],
			},
		};
	});
}
export function marklessSsrIsArmBranchAnchor(text) {
	return (
		typeof text === 'string' &&
		(text.startsWith('markless:arm-branch:') || text.startsWith('/markless:arm-branch:'))
	);
}
// The emitted localIndex (static parent locator count) assumes children render
// AFTER all parent hosts — false for projecting components (wrappers around the
// parent's projected content) and for children inside async arms. The final
// html knows the truth: locate each child's rendered subtree in document order
// and count element opens before it, then convert back to parent-walk
// coordinates by subtracting earlier children's element counts (need 13).
export function marklessSsrDeriveChildPositions(html, childData) {
	if (typeof html !== 'string' || html === '') return;
	let cursor = 0;
	let insertedBefore = 0;
	for (const child of childData) {
		const childHtml = child.output?.html;
		if (!childHtml) {
			insertedBefore += child.hostCount;
			continue;
		}
		const at = html.indexOf(childHtml, cursor);
		if (at === -1) {
			insertedBefore += child.hostCount;
			continue;
		}
		const opensBefore = (html.slice(0, at).match(/<[a-zA-Z]/g) ?? []).length;
		child.localIndex = opensBefore - insertedBefore;
		cursor = at + childHtml.length;
		insertedBefore += child.hostCount;
	}
}

export function marklessSsrAppendChildView(context) {
	const childView = context.child.view;
	const propEvents = context.child.output?.propEvents ?? [];
	const callbackProps = context.child.callbackProps ?? {};
	for (const locator of childView.locators)
		context.locators.push({
			...locator,
			hostNodeId: context.child.hostPrefix + locator.hostNodeId,
			index: context.baseIndex + locator.index,
		});
	for (const event of childView.events) {
		const propEvent = propEvents.find(
			(item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName,
		);
		const callbackSymbolId = propEvent ? callbackProps[propEvent.propName] : undefined;
		const symbolIds = callbackSymbolId
			? [callbackSymbolId]
			: event.symbolIds.map((symbolId) =>
					context.child.externalSymbolIds.has(symbolId)
						? symbolId
						: context.child.symbolPrefix + symbolId,
				);
		for (const symbolId of symbolIds)
			if (callbackSymbolId || context.child.externalSymbolIds.has(symbolId))
				context.externalSymbolIds.add(symbolId);
		context.events.push({
			...event,
			hostNodeId: context.child.hostPrefix + event.hostNodeId,
			symbolIds,
		});
	}
	for (const update of childView.domUpdates) {
		const mapped = marklessSsrRemapChildGraph(update, context.child.graphProps);
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
							const mapped = marklessSsrRemapChildGraph(
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
	for (const branch of childView.branches ?? [])
		context.branches.push({
			...branch,
			id: context.child.hostPrefix + branch.id,
			testReads: marklessSsrRemapChildReads(
				branch.testReads,
				context.child.graphProps,
				context.child.hostPrefix + branch.id,
			),
			...(branch.symbolId ? { symbolId: context.child.symbolPrefix + branch.symbolId } : {}),
			...(branch.armRecords
				? {
						armRecords: branch.armRecords.map((arm) =>
							marklessSsrPrefixArmRecord(arm, context.child),
						),
					}
				: {}),
		});
	for (const boundary of childView.asyncBoundaries ?? [])
		context.asyncBoundaries.push({
			...boundary,
			id: context.child.hostPrefix + boundary.id,
			asyncReads: marklessSsrRemapChildReads(
				boundary.asyncReads,
				context.child.graphProps,
				context.child.hostPrefix + boundary.id,
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
						armRecords: marklessSsrPrefixBoundaryArmRecords(
							boundary.armRecords,
							context.child,
						),
					}
				: {}),
		});
}
// A child boundary's armized record set keeps its arm-relative coordinates
// through composition (the anchor is located live at resume); only host ids,
// symbol ids, and behavior graph reads need the child prefixes/remaps.
export function marklessSsrPrefixBoundaryArmRecords(set, child) {
	return {
		locators: (set.locators ?? []).map((locator) => ({
			...locator,
			hostNodeId: child.hostPrefix + locator.hostNodeId,
		})),
		events: (set.events ?? []).map((event) => ({
			...event,
			hostNodeId: child.hostPrefix + event.hostNodeId,
			symbolIds: (event.symbolIds ?? []).map((symbolId) =>
				child.externalSymbolIds?.has?.(symbolId) ? symbolId : child.symbolPrefix + symbolId,
			),
		})),
		behaviors: (set.behaviors ?? []).map((behavior) => ({
			...behavior,
			hostNodeId: child.hostPrefix + behavior.hostNodeId,
			...(behavior.inputGraphReads
				? {
						inputGraphReads: behavior.inputGraphReads.map((read) => {
							const mapped = marklessSsrRemapChildGraph(read, child.graphProps);
							return mapped
								? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }
								: read;
						}),
					}
				: {}),
			...(behavior.symbolId ? { symbolId: child.symbolPrefix + behavior.symbolId } : {}),
		})),
		elementHandles: (set.elementHandles ?? []).map((handle) => ({
			...handle,
			hostNodeId: child.hostPrefix + handle.hostNodeId,
		})),
		// Arm-scoped branch records: anchors stay arm-local (resolved by
		// position, not text); ids/symbols/test reads take the child prefixes.
		...(set.branches
			? {
					branches: set.branches.map((branch) => ({
						...branch,
						id: child.hostPrefix + branch.id,
						testReads: marklessSsrRemapChildReads(
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
										marklessSsrPrefixArmRecord(arm, child),
									),
								}
							: {}),
					})),
				}
			: {}),
	};
}
export function marklessSsrRemapChildGraph(record, graphProps) {
	if (record.graphNodeId === 'prop:props') {
		const propName = record.path[0];
		const binding = graphProps.find((prop) => prop.name === propName);
		return binding
			? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path.slice(1)] }
			: null;
	}
	if (record.graphNodeId.startsWith?.('prop:')) {
		const propName = record.graphNodeId.slice(5);
		const binding = graphProps.find((prop) => prop.name === propName);
		return binding
			? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path] }
			: null;
	}
	return { graphNodeId: record.graphNodeId, path: record.path };
}
export function marklessSsrPrefixAnchorHtml(html, kind, id, prefixedId) {
	return html
		.replaceAll(`<!--markless:${kind}:${id}-->`, `<!--markless:${kind}:${prefixedId}-->`)
		.replaceAll(`<!--/markless:${kind}:${id}-->`, `<!--/markless:${kind}:${prefixedId}-->`);
}
export function marklessSsrRemapChildReads(reads, graphProps, recordId) {
	return (reads ?? []).map((read) => {
		const mapped = marklessSsrRemapChildGraph(read, graphProps);
		if (!mapped) throw new Error('MARKLESS_COMPOSED_READ_UNMAPPED: ' + recordId);
		return { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path };
	});
}
export function marklessSsrPrefixArmRecord(arm, child) {
	return {
		...arm,
		events: (arm.events ?? []).map((event) => ({
			...event,
			symbolIds: event.symbolIds.map((symbolId) => child.symbolPrefix + symbolId),
		})),
		domUpdates: (arm.domUpdates ?? []).map((update) => {
			const mapped = marklessSsrRemapChildGraph(update, child.graphProps);
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
export function marklessSsrResolveAnchorRecords(html, kind, records) {
	if (records.length === 0) return records;
	const pattern = /<!--([\s\S]*?)-->/g;
	const indexByText = new Map();
	let match;
	let index = 0;
	while ((match = pattern.exec(html)) !== null) {
		if (marklessSsrIsArmBranchAnchor(match[1])) continue;
		if (!indexByText.has(match[1])) indexByText.set(match[1], index);
		index++;
	}
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
