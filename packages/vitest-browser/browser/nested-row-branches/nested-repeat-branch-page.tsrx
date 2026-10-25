import { state } from '@markless/core';

interface View { readonly lists: readonly { readonly key: string; readonly items: readonly { readonly id: number; readonly view: string }[] }[] }
const EMPTY: View = { lists: [] };

export default function Page() @{
	let v = state(EMPTY);
	<main>
		<button id="add" onClick={() => setTimeout(() => (v = { lists: [{ key: 'a', items: [{ id: 1, view: 'x' }] }] }), 0)}>add</button>
		<section>@for (const list of v.lists; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.view === "x") { <><b>x</b></> }</li> }</ol> }</section>
	</main>
}
