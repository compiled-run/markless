export type ModuleGroup =
	| 'dispatch-core'
	| 'sync-policy'
	| 'dom-update'
	| 'keyed-repeat'
	| 'branch'
	| 'async-boundary'
	| 'behavior'
	| 'full-tier-dispatch-core'
	| 'full-resume-core';

export type PayloadRecordInventory = {
	readonly events?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly syncPolicy?: unknown;
	}>;
	readonly locators?: ReadonlyArray<{ readonly hostNodeId: string; readonly index: number }>;
	readonly domUpdates?: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly keyedRepeats?: ReadonlyArray<{
		readonly parentHostNodeId: string;
		readonly rowEvents: ReadonlyArray<{ readonly eventName: string; readonly syncPolicy?: unknown }>;
	}>;
	readonly branches?: ReadonlyArray<{
		readonly armRecords?: ReadonlyArray<{
			readonly events?: ReadonlyArray<{ readonly eventName: string; readonly syncPolicy?: unknown }>;
			readonly domUpdates?: ReadonlyArray<unknown>;
			readonly behaviors?: ReadonlyArray<unknown>;
			readonly elementHandles?: ReadonlyArray<unknown>;
		}>;
	}>;
	readonly asyncBoundaries?: ReadonlyArray<unknown>;
	readonly behaviors?: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly elementHandles?: ReadonlyArray<{ readonly hostNodeId: string }>;
};

export type RuntimeDispatchAction = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly recordKind?: 'event' | 'keyed-repeat-row';
	readonly syncPolicy?: unknown;
};

export const MODULE_GROUPS: Record<ModuleGroup, ReadonlySet<string>> = {
	'dispatch-core': new Set([
		'core/web/event-only-resume',
		'web/event-only-resume',
		'web/inline/payload-document',
		'web/event-only-graph',
	]),
	'sync-policy': new Set(['web/inline/sync-policy-core']),
	'dom-update': new Set(['web/dom-journal', 'web/dom-update']),
	'keyed-repeat': new Set(['web/repeat-runtime', 'web/resume-keyed-repeats']),
	branch: new Set(['web/resume-branches']),
	'async-boundary': new Set(['web/resume-async-boundaries']),
	behavior: new Set(['web/event-only-behaviors', 'web/resume-behaviors']),
	'full-tier-dispatch-core': new Set([
		'core/web/resume',
		'web/resume',
		'web/resume-runtime',
		// T007e/h/i/j file splits of resume-runtime/payload-full — same plane, new names:
		'web/resume-runtime-shared',
		'web/resume-runtime-start',
		'web/resume-events',
		'web/payload-full',
		'web/payload-resume',
		'web/payload-graph-construct',
		// Record-derived trigger installer: wiring-time module (installs demand triggers
		// from record data without importing capability modules) — allowed at first
		// dispatch when records are declared, like eager branch wiring (spec gate 2).
		'web/resume-async-wiring',
	]),
	'full-resume-core': new Set([
		'web/resume-locators',
	]),
};

export function deriveAllowedModules(
	payloadRecordInventory: PayloadRecordInventory,
	action: RuntimeDispatchAction,
): ReadonlySet<string> {
	const allowed = new Set(MODULE_GROUPS['dispatch-core']);
	const groups = structurallyReachableGroups(payloadRecordInventory, action);
	for (const group of groups) {
		for (const id of MODULE_GROUPS[group]) allowed.add(id);
	}
	return allowed;
}

export function forbiddenExecutedModules(
	executed: Iterable<string>,
	allowed: ReadonlySet<string>,
): string[] {
	return [...executed]
		.filter((id) => !isAllowedDispatchCoreVirtual(id) && isMarklessRuntimeModule(id) && !allowed.has(id))
		.sort();
}

function structurallyReachableGroups(
	inventory: PayloadRecordInventory,
	action: RuntimeDispatchAction,
): Set<Exclude<ModuleGroup, 'dispatch-core'>> {
	const groups = new Set<Exclude<ModuleGroup, 'dispatch-core'>>();
	if (requiresFullRuntimeTier(inventory)) groups.add('full-tier-dispatch-core');
	// PM ruling for spec 06 gate 2: branch wiring is bounded by declared
	// branch records and wires eagerly after write-demand broke arm-event
	// wiring twice. Async and behavior capabilities stay demand-gated.
	if ((inventory.branches?.length ?? 0) > 0) groups.add('branch');
	const matchingEvent = (inventory.events ?? []).find(
		(event) => event.hostNodeId === action.hostNodeId && event.eventName === action.eventName,
	);
	if (action.syncPolicy || matchingEvent?.syncPolicy) groups.add('sync-policy');
	if ((inventory.domUpdates ?? []).some((record) => record.hostNodeId === action.hostNodeId)) {
		groups.add('dom-update');
	}
	if ((inventory.behaviors ?? []).some((record) => record.hostNodeId === action.hostNodeId)) {
		groups.add('behavior');
	}
	if ((inventory.elementHandles ?? []).some((record) => record.hostNodeId === action.hostNodeId)) {
		groups.add('full-resume-core');
	}
	for (const repeat of inventory.keyedRepeats ?? []) {
		if (
			action.recordKind === 'keyed-repeat-row' ||
			(repeat.parentHostNodeId === action.hostNodeId &&
				repeat.rowEvents.some((event) => event.eventName === action.eventName))
		) {
			groups.add('keyed-repeat');
			if (repeat.rowEvents.some((event) => event.eventName === action.eventName && event.syncPolicy)) {
				groups.add('sync-policy');
			}
		}
	}
	for (const branch of inventory.branches ?? []) {
		for (const arm of branch.armRecords ?? []) {
			if (
				action.recordKind !== 'keyed-repeat-row' &&
				arm.events?.some((event) => event.eventName === action.eventName)
			) groups.add('branch');
			if (arm.domUpdates?.length) groups.add('dom-update');
			if (arm.elementHandles?.length) groups.add('full-resume-core');
		}
	}
	return groups;
}

function requiresFullRuntimeTier(inventory: PayloadRecordInventory): boolean {
	return (
		(inventory.branches?.length ?? 0) > 0 ||
		(inventory.keyedRepeats?.length ?? 0) > 0 ||
		(inventory.elementHandles?.length ?? 0) > 0 ||
		(inventory.asyncBoundaries?.length ?? 0) > 0
	);
}

function isMarklessRuntimeModule(id: string): boolean {
	return id.startsWith('web/') || id.startsWith('core/');
}

function isAllowedDispatchCoreVirtual(id: string): boolean {
	return id.startsWith('virtual:markless:payload:') || id.startsWith('virtual:markless:symbol:');
}
