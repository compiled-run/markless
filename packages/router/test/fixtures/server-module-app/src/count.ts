// The two counts the server holds, as "count/page requests".
export async function loadCounts(): Promise<string> {
	if (import.meta.env.SSR) {
		const { readCount, readPageRequests } = await import('../server/counter.ts');
		return `${readCount()}/${readPageRequests()}`;
	}
	const response = await fetch('/api/count');
	const { count, pageRequests } = (await response.json()) as {
		count: number;
		pageRequests: number;
	};
	return `${count}/${pageRequests}`;
}
