import { state } from '@markless/core';
import { SERVED, ops } from './lists.ts';

export default function NestedBranchPage() @{
	let early = state(SERVED);
	let late = state<typeof SERVED>([]);
	<main>
		<button data-op="load" onClick={() => setTimeout(() => (late = SERVED), 0)}>load</button>
		@for (const op of Object.keys(ops); key op) { <button data-op={op} onClick={() => { early = ops[op]!(early); late = ops[op]!(late); }}>{op}</button> }
		<section id="early">@for (const list of early; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ol> }</section>
		<section id="late">@for (const list of late; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ol> }</section>
	</main>
}
