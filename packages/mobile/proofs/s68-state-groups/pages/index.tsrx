import { state } from '@markless/core';

export default function App() @{
	let a = state(false);
	let b = state(false);
	let c = state(false);
	let d = state(false);
	let e = state(false);
	let panel = state(false);
	let note = state(false);
	<main>
		<style>
			main { padding: 16px; }
			.toggles { display: flex; flex-wrap: wrap; gap: 8px; }
			.t { padding: 8px 12px; border: 2px solid #44403c; border-radius: 8px; background: #f5f5f4; color: #1c1917; font-family: inherit; font-size: 16px; }
			.t.on { border-color: #166534; background: #dcfce7; color: #14532d; }
			.status { margin: 8px 0 0; color: #44403c; }
			.stage { height: 160px; margin-top: 16px; }
			.panel { position: absolute; left: 16px; top: 220px; width: 240px; height: 120px; z-index: 2; background: #bfdbfe; }
			.note { position: absolute; left: 96px; top: 260px; width: 200px; height: 64px; z-index: 3; background: #fde68a; }
			.fill { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; font-family: inherit; font-size: 16px; }
			.panel .fill { color: #1e3a8a; text-align: left; }
			.note .fill { color: #78350f; }
		</style>
		<title>State groups</title>
		<h1>State groups</h1>
		<div class="toggles">
			<button class={a ? 't on' : 't'} onClick={() => (a = !a)}>{a ? 'A on' : 'A off'}</button>
			<button class={b ? 't on' : 't'} onClick={() => (b = !b)}>{b ? 'B on' : 'B off'}</button>
			<button class={c ? 't on' : 't'} onClick={() => (c = !c)}>{c ? 'C on' : 'C off'}</button>
			<button class={d ? 't on' : 't'} onClick={() => (d = !d)}>{d ? 'D on' : 'D off'}</button>
			<button class={e ? 't on' : 't'} onClick={() => (e = !e)}>{e ? 'E on' : 'E off'}</button>
		</div>
		@if (note) {
			<p class="status">Note tapped</p>
		}
		@if (panel) {
			<p class="status">Panel tapped</p>
		}
		<div class="stage">
			@if (a) {
				<div class="panel">
					<button class="fill" onClick={() => (panel = true)}>Panel</button>
				</div>
			}
			@if (b) {
				<div class="note">
					<button class="fill" onClick={() => (note = true)}>Note</button>
				</div>
			}
		</div>
	</main>
}
