const shelf = [{ id: 'short', name: 'Short' }];

export async function loadMugs() {
	await new Promise((resolve) => setTimeout(resolve, shelf.length === 1 ? 10 : 300));
	return shelf.map((mug) => ({ ...mug }));
}

export async function saveMug(name: string) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	shelf.push({ id: name, name: name[0]!.toUpperCase() + name.slice(1) });
}
