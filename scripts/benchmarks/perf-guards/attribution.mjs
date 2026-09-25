import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import {
	MARKLESS_BUILD_PREFIX,
	MARKLESS_BYTE_ATTRIBUTION,
	MARKLESS_EXECUTION_DEMAND,
} from '../../../packages/bundler/src/build/chunking.ts';
import { CARRIES_UNLISTED_RECORDS } from '../../../packages/bundler/src/build/undemanded-runtime.ts';
import { RUNTIME_CAPABILITY_MODULE_IDS } from '../../../packages/compiler/src/passes/runtime-demand-map.ts';

export const CATEGORIES = ['runtime', 'glue', 'author', 'third-party'];
const UNATTRIBUTED = 'unattributed';
const RUNTIME = CATEGORIES[0];

export function readBuildJson(publicDir, asset) {
	const file = join(publicDir, asset);
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export const readAttribution = (publicDir) => readBuildJson(publicDir, MARKLESS_BYTE_ATTRIBUTION);
export const readDemand = (publicDir) => readBuildJson(publicDir, MARKLESS_EXECUTION_DEMAND);

const chunkKey = (pathname, base) => {
	const prefix = `${base}${MARKLESS_BUILD_PREFIX}`;
	return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
};

/**
 * Splits served files' gzip bytes into framework runtime / compiler glue / author / third-party.
 * Each module's share of a file follows its rendered length; bytes the bundler added around the
 * modules (wrappers, import rewriting, loaders) count as glue.
 */
export function attributeFiles(paths, attribution, read, base) {
	const byCategory = Object.fromEntries([...CATEGORIES, UNATTRIBUTED].map((c) => [c, 0]));
	const runtimeModules = new Set();
	for (const path of paths) {
		const gzipBytes = read(path)?.gzipBytes ?? 0;
		const chunk = attribution?.chunks?.[chunkKey(path, base)];
		if (!chunk) {
			byCategory[UNATTRIBUTED] += gzipBytes;
			continue;
		}
		const rendered = chunk.modules.reduce((total, [, , bytes]) => total + bytes, 0);
		const whole = Math.max(chunk.bytes, rendered) || 1;
		byCategory.glue += gzipBytes * ((whole - rendered) / whole);
		for (const [category, key, bytes] of chunk.modules) {
			byCategory[category] += gzipBytes * (bytes / whole);
			if (category === RUNTIME) runtimeModules.add(key);
		}
	}
	for (const category of Object.keys(byCategory))
		byCategory[category] = Math.round(byCategory[category]);
	return { byCategory, runtimeModules: [...runtimeModules].sort() };
}

/** Rendered bytes of every framework runtime module the build ships, summed over the chunks carrying it. */
export function runtimeModuleSizes(attribution) {
	const sizes = {};
	for (const chunk of Object.values(attribution?.chunks ?? {}))
		for (const [category, key, bytes] of chunk.modules)
			if (category === RUNTIME) sizes[key] = (sizes[key] ?? 0) + bytes;
	return Object.fromEntries(
		Object.keys(sizes)
			.sort()
			.map((key) => [key, sizes[key]]),
	);
}

const DEMAND_LISTS = ['payloadRecords', 'actions', 'symbols'];

function demandEntries(map) {
	return DEMAND_LISTS.flatMap((list) =>
		(map[list] ?? []).map((entry) => ({ list, entry, ids: entry.runtimeModuleIds ?? [] })),
	);
}

function demandLabel(list, entry) {
	if (list === 'payloadRecords') return `${entry.kind} records`;
	if (list === 'actions') return `${entry.recordKind ?? 'event'} actions`;
	return `${entry.kind ?? 'symbol'} symbols`;
}

/** The features (record kinds, actions, symbol kinds) whose compiled demand names each runtime module. */
export function runtimeFeatureIndex(demand) {
	const index = new Map();
	const add = (id, label) => index.set(id, new Set([...(index.get(id) ?? []), label]));
	for (const map of Object.values(demand ?? {})) {
		if (!map) continue;
		for (const { list, entry, ids } of demandEntries(map))
			for (const id of ids) add(id, demandLabel(list, entry));
		for (const id of map.capabilityModuleIds ?? []) add(id, 'capability');
		for (const id of map.nestedRecordModuleIds ?? []) add(id, 'records inside arms and rows');
		for (const id of map.unknownRecordModuleIds ?? []) add(id, 'records inside arms and rows');
	}
	return Object.fromEntries([...index].map(([id, labels]) => [id, [...labels].sort()]));
}

// A demand-map key is `<source>?markless-...`, spelled root-relative like the byte map.
function demandSource(key, appDir) {
	const source = key.replace(/[?#].*$/, '');
	return isAbsolute(source) ? relative(appDir, source) : source;
}

function moduleSource(key) {
	const bare = key.replace(/^virtual:markless:[a-z-]+:/, '').replace(/[?#].*$/, '');
	return bare
		.replace(/:symbol:\d+$/, '')
		.replace(/:[^/:]*$/, (tail) => (tail.includes('.') ? tail : ''));
}

/**
 * Pay-per-use: a runtime module that some compiled demand names (a feature module) may ship on a
 * page only when a demand map of that page's own modules names it. A map lists what its arms and
 * rows demand in `nestedRecordModuleIds`; a map that could not enumerate them leaves it out, and on
 * such pages only the capabilities every map enumerates module-wide (`capabilityModuleIds`) are judged.
 */
export function undemandedRuntimeModules({ paths, attribution, demand, appDir, base }) {
	const maps = Object.entries(demand ?? {}).filter(([, map]) => map);
	const features = new Set();
	for (const [, map] of maps) {
		for (const { ids } of demandEntries(map)) for (const id of ids) features.add(id);
		for (const id of map.capabilityModuleIds ?? []) features.add(id);
		for (const id of map.nestedRecordModuleIds ?? []) features.add(id);
		for (const id of map.unknownRecordModuleIds ?? []) features.add(id);
	}
	const shipped = new Set();
	const pageSources = new Set();
	for (const path of paths) {
		const chunk = attribution?.chunks?.[chunkKey(path, base)];
		for (const [category, key] of chunk?.modules ?? []) {
			if (category === RUNTIME) shipped.add(key);
			else pageSources.add(moduleSource(key));
		}
	}
	const demanded = new Set();
	const pageMaps = [];
	let unlisted = false;
	let capabilitiesEnumerated = true;
	for (const [key, map] of maps) {
		if (!pageSources.has(demandSource(key, appDir))) continue;
		pageMaps.push(demandSource(key, appDir));
		for (const { ids } of demandEntries(map)) for (const id of ids) demanded.add(id);
		for (const id of map.capabilityModuleIds ?? []) demanded.add(id);
		for (const id of map.nestedRecordModuleIds ?? []) demanded.add(id);
		if (!map.capabilityModuleIds) capabilitiesEnumerated = false;
		if (
			!map.nestedRecordModuleIds &&
			(map.payloadRecords ?? []).some((record) => CARRIES_UNLISTED_RECORDS[record.kind])
		)
			unlisted = true;
	}
	const capabilities = new Set(RUNTIME_CAPABILITY_MODULE_IDS);
	const judged = (id) =>
		features.has(id) && (!unlisted || (capabilitiesEnumerated && capabilities.has(id)));
	return {
		pageMaps: [...new Set(pageMaps)].sort(),
		shipped: shipped.size,
		judged: unlisted ? (capabilitiesEnumerated ? 'capabilities' : 'none') : 'all features',
		demandedFeatures: [...shipped].filter((id) => judged(id) && demanded.has(id)).sort(),
		undemanded: [...shipped].filter((id) => judged(id) && !demanded.has(id)).sort(),
	};
}

/** A copy of the demand in which no record, action or symbol names `id`; it stays a feature module. */
export function withoutDemand(demand, id) {
	const next = structuredClone(demand);
	for (const map of Object.values(next)) {
		if (!map) continue;
		for (const { entry } of demandEntries(map))
			entry.runtimeModuleIds = (entry.runtimeModuleIds ?? []).filter((other) => other !== id);
		if (map.capabilityModuleIds)
			map.capabilityModuleIds = map.capabilityModuleIds.filter((other) => other !== id);
		if (map.nestedRecordModuleIds)
			map.nestedRecordModuleIds = map.nestedRecordModuleIds.filter((other) => other !== id);
		map.unknownRecordModuleIds = [...new Set([...(map.unknownRecordModuleIds ?? []), id])];
	}
	return next;
}
