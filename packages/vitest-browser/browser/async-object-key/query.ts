export function queryKey(filter: { term: string; page: number }): string {
	return `${filter.term}:${filter.page}`;
}

export function settle(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
