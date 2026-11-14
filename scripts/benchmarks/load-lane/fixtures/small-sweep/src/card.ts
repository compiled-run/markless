export async function loadCard(): Promise<{ readonly title: string; readonly total: number }> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	return { title: 'Revenue', total: 4210 };
}

export async function loadBlock(name: string, delay: number): Promise<{ readonly title: string; readonly total: number }> {
	await new Promise((resolve) => setTimeout(resolve, delay));
	return { title: name, total: name.length * 101 };
}
