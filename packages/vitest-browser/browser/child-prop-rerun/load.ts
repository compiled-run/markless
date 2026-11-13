// Every browser load and save is recorded, so a test can read each id and tab the browser asked for.
export const asked: string[] = [];
const revisions = new Map<string, number>();

export function loadNote(id: string, tab: string, round: number): Promise<string> {
	if (typeof window !== 'undefined') asked.push(`load ${id} ${tab}`);
	return new Promise((resolve, reject) =>
		setTimeout(
			() =>
				id === undefined || tab === undefined
					? reject(new Error(`no note for ${id} ${tab}`))
					: resolve(`note ${id} ${tab} rev ${revisions.get(id) ?? 0} #${round}`),
			20,
		),
	);
}

export async function saveNote(id: string): Promise<void> {
	asked.push(`save ${id}`);
	revisions.set(id, (revisions.get(id) ?? 0) + 1);
}

export function resetNotes(): void {
	asked.length = 0;
	revisions.clear();
}
