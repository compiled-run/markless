export interface Item { readonly id: number; readonly view: string; readonly a: Readonly<Record<string, string | undefined>> }
export interface View { readonly at: Readonly<Record<string, { readonly shown: boolean; readonly items: readonly Item[] }>> }
export const EMPTY2: View = { at: { p0: { shown: false, items: [] } } };
let n = 1;
let items: Item[] = [];
export function add2(commit: (v: View) => void): void {
	setTimeout(() => {
		items = [{ id: n++, view: '0.0', a: { 'data-index': '0', 'data-x': undefined } }, ...items];
		commit({ at: { p0: { shown: true, items } } });
	}, 0);
}
export function addFlat(commit: (v: readonly Item[]) => void): void {
	setTimeout(() => {
		items = [{ id: n++, view: '0.0', a: { 'data-index': '0' } }, ...items];
		commit(items);
	}, 0);
}
