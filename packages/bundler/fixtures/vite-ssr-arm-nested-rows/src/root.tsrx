import { computed, state } from '@markless/core';
import { row, shelf, weeksOf } from './model.ts';

const SHOWN = true;

export default function Lists() @{
	let month = state(0);
	const weeks = computed(() => weeksOf(month));
	let grid = state([row('a'), row('b')]);
	let shelves = state([shelf('s')]);
	let open = state(false);
	let later = state([row('p'), row('q')]);
	let picked = state('');

	<>
		<p id="picked">{picked}</p>
		@if (SHOWN) {
			<main>
				<section id="weeks">
					<button data-next onClick={() => (month = month + 1)}>next</button>
					<table>
						<tbody>
							@for (const week of weeks; key week.key) {
								<tr>
									@for (const day of week.days; key day.key) {
										<td data-on={day.text === picked ? 'on' : 'off'} onClick={() => (picked = day.text)}>{day.text}</td>
									}
								</tr>
							}
						</tbody>
					</table>
				</section>
				<section id="grid">
					<button data-grid="add" onClick={() => grid.push(row(`n${grid.length}`))}>add</button>
					<button data-grid="remove" onClick={() => grid.shift()}>remove</button>
					<button data-grid="reverse" onClick={() => grid.reverse()}>reverse</button>
					<ul>
						@for (const r of grid; key r.key) {
							<li>
								<button data-grid-row={r.key} onClick={() => r.cells.push({ key: 'x', text: 'x' })}>+</button>
								@for (const c of r.cells; key c.key) {
									<b data-on={c.text === picked ? 'on' : 'off'} onClick={() => (picked = c.text)}>{c.text}</b>
								}
							</li>
						}
					</ul>
				</section>
				<section id="shelves">
					<button data-shelves="add" onClick={() => shelves.push(shelf(`t${shelves.length}`))}>add</button>
					@for (const s of shelves; key s.key) {
						<div class="shelf">
							<button data-shelf={s.key} onClick={() => s.rows.push(row(`${s.key}c`))}>+</button>
							@for (const r of s.rows; key r.key) {
								<ol>
									@for (const c of r.cells; key c.key) {
										<li onClick={() => (picked = c.text)}>{c.text}</li>
									}
								</ol>
							}
						</div>
					}
				</section>
			</main>
		}
		<button data-open onClick={() => (open = !open)}>open</button>
		@if (open) {
			<section id="later">
				<button data-later="add" onClick={() => later.push(row(`m${later.length}`))}>add</button>
				<button data-later="reverse" onClick={() => later.reverse()}>reverse</button>
				<ul>
					@for (const r of later; key r.key) {
						<li>
							@for (const c of r.cells; key c.key) {
								<b data-on={c.text === picked ? 'on' : 'off'} onClick={() => (picked = c.text)}>{c.text}</b>
							}
						</li>
					}
				</ul>
			</section>
		}
	</>
}
