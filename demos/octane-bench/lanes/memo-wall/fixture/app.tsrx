import { state } from '@markless/core';
import { bumpTheme, changeMiddle, makeRows, type WallRow } from './data.ts';

// JSFB-proven authoring shape throughout. Compiler landmines this fixture
// dodges (framework findings 5-6): call-expression state() initializers,
// module-scope calls, template literals, and non-row state references inside
// keyed-row expressions all silently drop or empty output. Walls start empty
// and fill via handlers (fill dispatch = the measured wall-mount operation);
// the fan-out travels IN row data (theme field) because single-source
// cross-state fan-out into rows is blocked on finding 5c.
export function App() @{
	let rowsA = state<WallRow[]>([]);
	let rowsB = state<WallRow[]>([]);
	let tickA = state(0);
	let tickB = state(0);

	<div class="walls">
		<div class="actions">
			<button type="button" id="fill-a" onClick={() => { rowsA = makeRows(); }}>fill A</button>
			<button type="button" id="fill-b" onClick={() => { rowsB = makeRows(); }}>fill B</button>
			<button type="button" id="equal-a" onClick={() => { tickA = tickA; }}>equal A</button>
			<button type="button" id="equal-b" onClick={() => { tickB = tickB; }}>equal B</button>
			<button type="button" id="one-a" onClick={() => { rowsA = changeMiddle(rowsA); }}>one A</button>
			<button type="button" id="one-b" onClick={() => { rowsB = changeMiddle(rowsB); }}>one B</button>
			<button type="button" id="theme-a" onClick={() => { rowsA = bumpTheme(rowsA); }}>theme A</button>
			<button type="button" id="theme-b" onClick={() => { rowsB = bumpTheme(rowsB); }}>theme B</button>
		</div>
		<table class="wall" id="wall-a"><tbody>
			@for (row of rowsA; key row.id) {
				<tr class="item">
					<td class="row" data-value>{row.value}</td>
					<td class="inner" data-value>{row.value + 1}</td>
					<td class="leaf" data-value>{row.value + row.theme}</td>
				</tr>
			}
		</tbody></table>
		<table class="wall" id="wall-b"><tbody>
			@for (row of rowsB; key row.id) {
				<tr class="item">
					<td class="row" data-value>{row.value}</td>
					<td class="inner" data-value>{row.value + 1}</td>
					<td class="leaf" data-value>{row.value + row.theme}</td>
				</tr>
			}
		</tbody></table>
	</div>
}
