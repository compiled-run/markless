export async function loadTodos(filter: string, reload: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return [
		{ id: 1, name: `Dune ${reload}` },
		{ id: 2, name: `Emma ${reload}` },
		{ id: 3, name: `Ubik ${reload}` },
	].filter((todo) => todo.name.toLowerCase().includes(filter));
}
