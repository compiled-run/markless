// Stand-ins for a fetch: each answers after a short wait with values named after what it was asked.
export async function fetchShelf(label: unknown): Promise<{ id: number; text: string }[]> {
	await new Promise((resolve) => setTimeout(resolve, 120));
	return [
		{ id: 1, text: `${String(label)} one` },
		{ id: 2, text: `${String(label)} two` },
	];
}

export async function lookUpBalance(name: string, round: number): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 150));
	if (name === 'Broken') throw new Error('ledger offline');
	return `${name}#${round}`;
}
