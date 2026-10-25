import { state } from '@markless/core';
import { EMPTY2, add2 } from './engine2.ts';

function hit(id: number, event: Event): void { console.log('hit', id, event.type); }

export default function Page() @{
	let v = state(EMPTY2);
	<main><button id="show" onClick={() => add2((x) => (v = x))}>Show</button><section>@for (const item of v.at.p0.items; key item.id) { <li onClick={(event) => hit(item.id, event)}>@if (item.view === "0.0") { <><b>z</b></> }</li> }</section></main>
}
