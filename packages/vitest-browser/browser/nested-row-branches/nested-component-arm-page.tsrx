import { state } from '@markless/core';
import { SERVED, ops } from './lists.ts';

function Badge({ label }: { label: string }) @{
	<b>{label}</b>
}

export default function NestedComponentArmPage() @{
	let early = state(SERVED);
	let late = state<typeof SERVED>([]);
	<main>
		<button data-op="load" onClick={() => setTimeout(() => (late = SERVED), 0)}>load</button>
		@for (const op of Object.keys(ops); key op) { <button data-op={op} onClick={() => { early = ops[op]!(early); late = ops[op]!(late); }}>{op}</button> }
		<section id="early">@for (const list of early; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <Badge label={item.label} /> } @else { <i>off</i> }</li> }</ol> }</section>
		<section id="late">@for (const list of late; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <Badge label={item.label} /> } @else { <i>off</i> }</li> }</ol> }</section>
	</main>
}
