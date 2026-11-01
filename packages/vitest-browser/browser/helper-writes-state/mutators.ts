export function rename(person: { first: string }, next: string): void {
	person.first = next;
}
export function addItem(items: string[], item: string): void {
	items.push(item);
}
export function markDone(task: { done: boolean; title: string }): void {
	task.done = !task.done;
}
export function retitle(board: { meta: { title: string }; tasks: unknown[] }, title: string): void {
	setTitle(board.meta, title);
}
function setTitle(meta: { title: string }, title: string): void {
	meta.title = title;
}
export function titleOf(board: { meta: { title: string } }): string {
	return board.meta.title.toUpperCase();
}
