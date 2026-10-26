export async function slowValue(id: string): Promise<{ text: string }> {
	if (typeof window !== 'undefined')
		(window as unknown as { browserRuns: number }).browserRuns =
			((window as unknown as { browserRuns?: number }).browserRuns ?? 0) + 1;
	await new Promise((done) => setTimeout(done, 30));
	return { text: `value ${id}` };
}
