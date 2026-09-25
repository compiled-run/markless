export async function loadHeading(search: string): Promise<{ heading: string }> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	return { heading: `Loaded${search}` };
}
