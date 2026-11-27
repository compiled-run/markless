import {
	decodeStorageCookieValue,
	STORAGE_RENDER_CONTEXT_READER,
	storageAttributeName,
	storageCookieName,
} from '../../serializer/src/storage-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from './prerender/evaluator.ts';

/**
 * The value a visitor saved under a storage() key, read in the browser the way the page head
 * script reads it: the cookie first, then `localStorage`. A saved value is also put on the
 * `<html>` data attribute the head script sets. Undefined when nothing is saved.
 */
export function readSavedStorageValue(driverKey: string): string | undefined {
	const value = savedCookieValue(driverKey) ?? savedLocalValue(driverKey);
	if (value !== undefined)
		try {
			globalThis.document.documentElement.setAttribute(storageAttributeName(driverKey), value);
		} catch {}
	return value;
}

function savedCookieValue(driverKey: string): string | undefined {
	try {
		const name = `${storageCookieName(driverKey)}=`;
		const cookie = globalThis.document.cookie.split('; ').find((part) => part.startsWith(name));
		return cookie ? decodeStorageCookieValue(cookie.slice(name.length)) : undefined;
	} catch {
		return undefined;
	}
}

function savedLocalValue(driverKey: string): string | undefined {
	try {
		return globalThis.localStorage.getItem(driverKey) ?? undefined;
	} catch {
		return undefined;
	}
}

/** What a client render passes a compiled render body, so each storage() cell renders its saved value. */
export const savedStorageRenderContext = { [STORAGE_RENDER_CONTEXT_READER]: readSavedStorageValue };

/** The surface with each storage() cell starting from the visitor's saved value, in this module and the ones it imports. */
export function withSavedStorageValues(
	surface: PrerenderDataSurface,
	seeded = new Map<PrerenderDataSurface, PrerenderDataSurface>(),
): PrerenderDataSurface {
	const known = seeded.get(surface);
	if (known) return known;
	const copy = { ...surface } as { -readonly [K in keyof PrerenderDataSurface]: PrerenderDataSurface[K] };
	seeded.set(surface, copy);
	copy.components = Object.fromEntries(
		Object.entries(surface.components).map(([name, definition]) => [name, withSavedCells(definition)]),
	);
	copy.imports = Object.fromEntries(
		Object.entries(surface.imports).map(([source, imported]) => [
			source,
			withSavedStorageValues(imported, seeded),
		]),
	);
	return copy;
}

function withSavedCells(definition: PrerenderDataDefinition): PrerenderDataDefinition {
	const saved = new Map<string, string>();
	for (const record of definition.state.storage ?? []) {
		const value = readSavedStorageValue(record.key);
		if (value !== undefined) saved.set(record.graphNodeId, value);
	}
	if (saved.size === 0) return definition;
	return {
		...definition,
		initialValues: definition.initialValues?.map((initial) =>
			saved.has(initial.graphNodeId)
				? { graphNodeId: initial.graphNodeId, value: { kind: 'constant', value: saved.get(initial.graphNodeId) } }
				: initial,
		),
	};
}
