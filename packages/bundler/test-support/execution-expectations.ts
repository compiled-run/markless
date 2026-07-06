export type ModuleGroup =
	| 'dispatch-core'
	| 'sync-policy'
	| 'dom-update'
	| 'keyed-repeat'
	| 'branch'
	| 'async-boundary'
	| 'behavior'
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
	'full-resume-core': new Set([
		'core/web/resume',
		'web/payload-full',
		'web/resume',
		'web/resume-events',
		'web/resume-locators',
		'web/resume-runtime',
		'web/resume-handoff',
		'web/resume-sync-computed',
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
	return [...executed].filter((id) => isMarklessRuntimeModule(id) && !allowed.has(id)).sort();
}

function structurallyReachableGroups(
	inventory: PayloadRecordInventory,
	action: RuntimeDispatchAction,
): Set<Exclude<ModuleGroup, 'dispatch-core'>> {
	const groups = new Set<Exclude<ModuleGroup, 'dispatch-core'>>();
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
			if (arm.events?.some((event) => event.eventName === action.eventName)) groups.add('branch');
			if (arm.domUpdates?.length) groups.add('dom-update');
			if (arm.behaviors?.length) groups.add('behavior');
			if (arm.elementHandles?.length) groups.add('full-resume-core');
		}
	}
	return groups;
}

function isMarklessRuntimeModule(id: string): boolean {
	return id.startsWith('web/') || id.startsWith('core/') || id.startsWith('virtual:markless:');
}
