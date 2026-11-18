export type Mug = { readonly id: number; readonly name: string };

export async function loadMugs(): Promise<Mug[]> {
	const response = await fetch('/api/mugs');
	return response.json();
}

export async function saveMug(name: string) {
	const response = await fetch('/api/mugs', {
		method: 'POST',
		body: JSON.stringify({ name }),
	});
	if (!response.ok) throw new Error(`Saving failed (${response.status})`);
}
