export type UpdateRow = {
	readonly id: string;
	readonly project: string;
	readonly version: string;
	readonly stage: string;
};

export type UpdateFeed = {
	readonly channel: string;
	readonly updates: readonly UpdateRow[];
};

// The absolute request URL is the SSR host adapter; the CSR twin uses its
// browser origin and otherwise keeps this request contract identical.
export async function fetchLocalUpdates(
	requestUrl: string,
	signal: AbortSignal,
): Promise<UpdateFeed> {
	const url = new URL(requestUrl);
	url.pathname = '/api/updates';
	url.hash = '';
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Local update request failed with status ${response.status}.`);
	}
	return (await response.json()) as UpdateFeed;
}
