export async function save(): Promise<void> {
	const response = await fetch('/api/save', { method: 'POST' });
	if (!response.ok) throw new Error(`Saving failed (${response.status})`);
}

let loads = 0;
export async function loadThing(): Promise<{ loads: number }> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { loads: ++loads };
}
