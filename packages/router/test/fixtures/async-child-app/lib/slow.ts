export function slow<T>(value: T, ms: number): Promise<T> {
	if (typeof window !== 'undefined')
		(window as unknown as { browserRuns: number }).browserRuns =
			((window as unknown as { browserRuns?: number }).browserRuns ?? 0) + 1;
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
