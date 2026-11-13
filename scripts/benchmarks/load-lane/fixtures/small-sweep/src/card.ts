export async function loadCard(): Promise<{ readonly title: string; readonly total: number }> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	return { title: 'Revenue', total: 4210 };
}
