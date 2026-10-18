const host = globalThis as { __idleCounts?: Record<string, number> };

export function count(name: string): void {
	const counts = (host.__idleCounts ??= {});
	counts[name] = (counts[name] ?? 0) + 1;
}
