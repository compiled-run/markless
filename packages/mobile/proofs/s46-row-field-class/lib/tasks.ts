export type TaskRow = { readonly id: string; readonly title: string; readonly tone: string };

const TITLES = ['Buy milk', 'Call the plumber', 'Water the plants'];

export function taskRows(done: number): TaskRow[] {
	return TITLES.map((title, index) => {
		const id = `t${index}`;
		return { id, title, tone: index < done ? 'done' : ' ' };
	});
}

export async function loadTasks(done: number): Promise<{ readonly rows: TaskRow[] }> {
	return { rows: taskRows(done) };
}
