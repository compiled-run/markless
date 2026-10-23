const store = globalThis as typeof globalThis & { __fragmentCacheCount?: number };

export function count(): number {
	return store.__fragmentCacheCount ?? 0;
}

export function bump(): number {
	return (store.__fragmentCacheCount = count() + 1);
}
