import { decodeStorageCookieValue, storageCookieName } from './storage-slot.ts';

// Server half of storage(): the browser never loads this module.

// Reads storage values out of a request's Cookie header. Only names minted by
// storageCookieName are kept; everything else in the header is ignored.
export function createStorageCookieReader(
	cookieHeader: string | null | undefined,
): (driverKey: string) => string | undefined {
	const prefix = storageCookieName('');
	const values = new Map<string, string>();
	for (const part of (cookieHeader ?? '').split(';')) {
		const separator = part.indexOf('=');
		if (separator < 0) continue;
		const name = part.slice(0, separator).trim();
		if (!name.startsWith(prefix) || values.has(name)) continue;
		const value = decodeStorageCookieValue(part.slice(separator + 1).trim());
		if (value !== undefined) values.set(name, value);
	}
	return (driverKey) => values.get(storageCookieName(driverKey));
}
