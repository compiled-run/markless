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

export async function fetchLocalUpdates(search: string, signal: AbortSignal): Promise<UpdateFeed> {
	const response = await fetch(`/api/updates${search}`, { signal });
	if (!response.ok) {
		throw new Error(`Local update request failed with status ${response.status}.`);
	}
	return (await response.json()) as UpdateFeed;
}
