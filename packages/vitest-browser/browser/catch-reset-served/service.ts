// Report ids the service fails for; the server starts with these down, and tests bring them up on the client.
export const service = { down: new Set<string>(['first', 'child', 'inner']) };

export async function loadReport(id: string): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	if (service.down.has(id)) throw new Error(`${id} offline`);
	return `${id} ready`;
}
