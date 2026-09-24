import { RUNTIME_CAPABILITY_MODULE_IDS, type RuntimeDemandMapRecordKind } from '@markless/compiler';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { runtimeModuleIdFromOrigin } from './bundle-graph.ts';

// Records whose served arms or rows carry further records the demand map does not enumerate.
export const CARRIES_UNLISTED_RECORDS = {
	'async-boundary': true,
	behavior: false,
	branch: true,
	'dom-update': false,
	'element-handle': false,
	[PROTOCOL_EVENT_ACTION_KIND.event]: false,
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: false,
	'keyed-repeat': true,
	overlay: false,
} satisfies Record<RuntimeDemandMapRecordKind, boolean>;

const CAPABILITY_MODULE_IDS = new Set(RUNTIME_CAPABILITY_MODULE_IDS);

// Possible runtime modules no compiled record demands; empty whenever any demand map leaves demand open.
// Unlisted arm and row records narrow the answer to capabilities every map enumerates module-wide.
export function undemandedRuntimeModules(input: {
	readonly demandMaps: Iterable<RuntimeDemandMapManifest | undefined>;
	readonly moduleIds: Iterable<string>;
}): Set<string> {
	const maps = [...input.demandMaps];
	if (maps.length === 0 || maps.some((map) => !map)) return new Set();
	const possible = new Set<string>();
	const demanded = new Set<string>();
	let fullDispatch = false;
	let unlisted = false;
	let capabilitiesEnumerated = true;
	for (const map of maps as RuntimeDemandMapManifest[]) {
		if (map.recordKinds.some((kind) => kind.replaced)) return new Set();
		if (map.capabilityModuleIds) for (const id of map.capabilityModuleIds) demanded.add(id);
		else capabilitiesEnumerated = false;
		for (const record of map.payloadRecords) {
			if (CARRIES_UNLISTED_RECORDS[record.kind]) unlisted = true;
			if (record.kind === PROTOCOL_EVENT_ACTION_KIND.event && record.runtimeModuleIds.length)
				fullDispatch = true;
		}
		for (const id of map.unknownRecordModuleIds) possible.add(id);
		for (const entry of [...map.payloadRecords, ...map.actions, ...map.symbols])
			for (const id of entry.runtimeModuleIds) demanded.add(id);
	}
	if (!fullDispatch || (unlisted && !capabilitiesEnumerated)) return new Set();
	const undemanded = new Set<string>();
	for (const moduleId of input.moduleIds) {
		const runtimeId = runtimeModuleIdFromOrigin(moduleId.split('?')[0]!);
		if (
			runtimeId &&
			possible.has(runtimeId) &&
			!demanded.has(runtimeId) &&
			(!unlisted || CAPABILITY_MODULE_IDS.has(runtimeId))
		)
			undemanded.add(moduleId);
	}
	return undemanded;
}
