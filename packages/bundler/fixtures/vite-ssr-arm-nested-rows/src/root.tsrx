import { computed, state } from '@markless/core';
import Grid from './grid.tsrx';
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
	let toggled = state(true);
	let flip = state([row('f'), row('g')]);
	let deep = state([shelf('d')]);
	let mode = state('lists');
	let bounded = state([row('i'), row('j')]);
	const label = computed(async () => `${bounded.length} rows`);
	let pair = state([{ key: 'v', left: [row('v')], right: [row('w')] }]);

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
				<Grid />
				<section id="pair">
					<button data-pair onClick={() => pair.push({ key: 'z', left: [row('y')], right: [row('z')] })}>add</button>
					@for (const p of pair; key p.key) {
						<div class="pair">
							<ul class="left">
								@for (const r of p.left; key r.key) {
									<li>{r.key}</li>
								}
							</ul>
							<ul class="right">
								@for (const r of p.right; key r.key) {
									<li>{r.key}</li>
								}
							</ul>
						</div>
					}
				</section>
			</main>
		}
		<button data-toggle onClick={() => (toggled = !toggled)}>toggle</button>
		<button data-flip onClick={() => flip.push(row(`h${flip.length}`))}>flip</button>
		@if (toggled) {
			<section id="toggled">
				<ul>
					@for (const r of flip; key r.key) {
						<li>
							@for (const c of r.cells; key c.key) {
								<b data-on={c.text === picked ? 'on' : 'off'} onClick={() => (picked = c.text)}>{c.text}</b>
							}
						</li>
					}
				</ul>
			</section>
		}
		<button data-mode onClick={() => (mode = mode === 'lists' ? 'none' : 'lists')}>mode</button>
		@switch (mode) {
			@case 'lists': {
				<section id="switched">
					<button data-switched onClick={() => flip.push(row(`s${flip.length}`))}>add</button>
					<ul>
						@for (const r of flip; key r.key) {
							<li>
								@for (const c of r.cells; key c.key) {
									<b>{c.text}</b>
								}
							</li>
						}
					</ul>
				</section>
			}
			@case 'none': {
				<p id="none">none</p>
			}
		}
		@if (!SHOWN) {
			<p>hidden</p>
		} @else {
			<section id="elsed">
				<button data-elsed onClick={() => grid.push(row(`e${grid.length}`))}>add</button>
				<ul>
					@for (const r of grid; key r.key) {
						<li>
							@for (const c of r.cells; key c.key) {
								<b>{c.text}</b>
							}
						</li>
					}
				</ul>
			</section>
		}
		@try {
			<div id="boundary">
				<p>{label}</p>
				@if (SHOWN) {
					<section id="bounded">
						<button data-bounded onClick={() => bounded.push(row(`q${bounded.length}`))}>add</button>
						<ul>
							@for (const r of bounded; key r.key) {
								<li>
									@for (const c of r.cells; key c.key) {
										<b>{c.text}</b>
									}
								</li>
							}
						</ul>
					</section>
				}
			</div>
		} @pending {
			<p>loading</p>
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
				<button data-deep="add" onClick={() => deep.push(shelf(`u${deep.length}`))}>add</button>
				@for (const s of deep; key s.key) {
					<div class="deep">
						<button data-deep-row={s.key} onClick={() => s.rows.push(row(`${s.key}c`))}>+</button>
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
		}
	</>
}
