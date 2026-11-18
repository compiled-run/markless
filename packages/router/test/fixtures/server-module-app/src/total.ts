// The page's server half imports api/total.ts itself, through src/total-server.ts.
export async function loadTotal(): Promise<string> {
	if (import.meta.env.SSR) {
		const { serverTotal } = await import('./total-server.ts');
		return serverTotal();
	}
	const response = await fetch('/api/total');
	return ((await response.json()) as { total: string }).total;
}
