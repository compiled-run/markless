import { state } from '@markless/core';
import { FLAT, flatOps } from './lists.ts';

export default function RowBranchPage() @{
	let early = state(FLAT);
	let late = state<typeof FLAT>([]);
	let hits = state('');
	<main>
		<button data-op="load" onClick={() => setTimeout(() => (late = FLAT.map((item) => ({ ...item }))), 0)}>load</button>
		@for (const op of Object.keys(flatOps); key op) { <button data-op={op} onClick={() => { early = flatOps[op]!(early); late = flatOps[op]!(late); }}>{op}</button> }
		<p id="hits">{hits}</p>
		<ul id="early">@for (const item of early; index i; key item.id) { <li data-at={i}>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ul>
		<ul id="late">@for (const item of late; index i; key item.id) { <li data-at={i}>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ul>
		<ul id="early-handled">@for (const item of early; index i; key item.id) { <li data-at={i} onClick={() => (hits = hits + item.label + ';')}>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ul>
		<ul id="late-handled">@for (const item of late; index i; key item.id) { <li data-at={i} onClick={() => (hits = hits + item.label + ';')}>@if (item.on) { <b>{item.label}</b> } @else { <i>off</i> }</li> }</ul>
	</main>
}
