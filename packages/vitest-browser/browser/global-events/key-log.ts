type KeyLogHost = typeof globalThis & { __globalKeyRuns?: string[]; __routeKeyRuns?: string[] };

/** Records which keys a document handler ran for, on the test page's window. */
export function logKey(log: '__globalKeyRuns' | '__routeKeyRuns', key: string): void {
	const host = globalThis as KeyLogHost;
	(host[log] ??= []).push(key);
}
