export async function loadStock(round: number): Promise<{ id: number; count: number }[]> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	return [
		{ id: 1, count: 3 + round },
		{ id: 2, count: 5 + round },
	];
}

export async function loadLabel(prefix: string): Promise<{ text: string }> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	return { text: `${prefix} ready` };
}
