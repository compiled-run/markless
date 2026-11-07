// Counts fetches so a test can show a handler's rejection never re-runs or cancels them.
export const fetches = { report: 0, balance: 0 };
// Values whose next fetch fails; tests change it between steps.
export const failing = new Set<string>(['balance']);

export async function saveReport(days: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	throw new Error(`could not save ${days}`);
}

export const actions = {
	save(days: number): Promise<void> {
		return saveReport(days);
	},
};
