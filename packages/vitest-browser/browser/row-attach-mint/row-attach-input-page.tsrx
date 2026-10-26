import { state } from '@markless/core';
import { setHtml } from './attach-log.ts';

export default function RowAttachInputPage() @{
	let early = state([{ id: 1, html: 'one' }]);
	let late = state<{ id: number; html: string }[]>([]);
	let picked = state(0);
	<main>
		<button data-op="fill" onClick={() => { late = [{ id: 1, html: 'one' }, { id: 2, html: 'two' }]; early = [...early, { id: 2, html: 'two' }]; }}>fill</button>
		<button data-op="drop" onClick={() => { late = late.slice(1); early = early.slice(1); }}>drop</button>
		<button data-op="back" onClick={() => { late = [{ id: 1, html: 'one' }, ...late]; early = [{ id: 1, html: 'one' }, ...early]; }}>back</button>
		<p id="picked">{picked}</p>
		<div id="early">@for (const row of early; key row.id) { <div class="row" onClick={() => (picked = row.id)} attach={setHtml(row.html)}></div> }</div>
		<div id="late">@for (const row of late; key row.id) { <div class="row" onClick={() => (picked = row.id)} attach={setHtml(row.html)}></div> }</div>
	</main>
}
