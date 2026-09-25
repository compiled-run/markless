import { RUNTIME_CAPABILITY_MODULE_IDS, type RuntimeDemandMapRecordKind } from '@markless/compiler';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { runtimeModuleIdFromOrigin } from './bundle-graph.ts';

// Records whose served arms or rows carry further records, listed only in `nestedRecordModuleIds`.
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
// Arm and row records a map does not enumerate narrow the answer to capabilities every map enumerates.
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
		if (map.nestedRecordModuleIds) for (const id of map.nestedRecordModuleIds) demanded.add(id);
		for (const record of map.payloadRecords) {
			if (CARRIES_UNLISTED_RECORDS[record.kind] && !map.nestedRecordModuleIds)
				unlisted = true;
			if (record.kind === PROTOCOL_EVENT_ACTION_KIND.event && record.runtimeModuleIds.length)
				fullDispatch = true;
		}
		for (const id of map.unknownRecordModuleIds) possible.add(id);
		for (const entry of [
			...map.payloadRecords,
			...map.actions,
			...(map.armActions ?? []),
			...map.symbols,
		])
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

const RE_EXPORT_ONLY =
	/^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(?:export\s*\*\s*from\s*(["'])[^"']+\1\s*;?(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*)+$/;

export function isReExportOnlySource(code: string | null | undefined): boolean {
	return !!code && RE_EXPORT_ONLY.test(code);
}

export function isReExportDoor(info: {
	readonly code: string | null;
	readonly importedIds: readonly string[];
	readonly dynamicallyImportedIds: readonly string[];
}): boolean {
	return (
		info.importedIds.length > 0 &&
		info.dynamicallyImportedIds.length === 0 &&
		isReExportOnlySource(info.code)
	);
}

// A module whose whole source is `export * from` statements is a lazy door: undemanded when all it re-exports is.
export function withUndemandedReExportDoors(
	modules: ReadonlyMap<
		string,
		{ readonly dependencies: readonly string[]; readonly reExportsOnly?: boolean }
	>,
	undemanded: ReadonlySet<string>,
): Set<string> {
	const result = new Set(undemanded);
	for (let grew = result.size > 0; grew;) {
		grew = false;
		for (const [id, module] of modules)
			if (
				module.reExportsOnly &&
				!result.has(id) &&
				module.dependencies.length > 0 &&
				module.dependencies.every((dependency) => result.has(dependency))
			) {
				result.add(id);
				grew = true;
			}
	}
	return result;
}
