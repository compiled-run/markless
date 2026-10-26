import { computed, state } from '@markless/core';
import { hold, later, rows } from '../lib/rows.ts';

export default function Variants() @{
	let n = state(2);
	let held = state('');
	let settled = state('');
	let picked = state('');
	const list = computed(async () => {
		const count = n;
		return rows(count);
	});
	<main>
		<button id="more" onClick={() => n++}>more</button>
		<input id="h" onInput={async (event) => {
			const value = (event.target as HTMLInputElement).value;
			await hold(value);
			held = value;
		}} />
		<p id="held">{held}</p>
		<input id="d" onInput={(event) => later(event.target, 300)} onSearchsettle={(event) => (settled = (event.target as HTMLInputElement).value)} />
		<p id="settled">{settled}</p>
		<p id="picked">{picked}</p>
		<div id="v5">
			@try {
				<ul hidden={list.length === 0}>
					@for (const r of list; key r.id) {
						<li>{r.text}</li>
					}
				</ul>
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v6">
			@try {
				@for (const r of list; key r.id) {
					<p class="pick" onCmdk-item-select={() => (picked = `dash ${r.text}`)} onCmdkselect={() => (picked = `plain ${r.text}`)} onClick={() => (picked = `click ${r.text}`)}>{r.text}</p>
				}
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v7">
			@try {
				@for (const r of list; key r.id) {
					<p data-value={`${r.text} ${r.id}`.trim()}>{r.text}</p>
				}
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v1">
			@try {
				@for (const r of list; key r.id) {
					<p>{r.text}</p>
				}
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v2">
			@try {
				@for (const r of list; key r.id) {
					<p id={r.id}>{r.text}</p>
				}
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v3">
			@try {
				<ul>
					@for (const r of list; key r.id) {
						<li>{r.text}</li>
					}
				</ul>
			} @catch {
				<p>failed</p>
			}
		</div>
		<div id="v4">
			@try {
				<span>{list.length}</span>
			} @pending {
				<span>wait</span>
			} @catch {
				<p>failed</p>
			}
		</div>
	</main>
}
