import { state } from '@markless/core';

export default function App() @{
	let shown = state(true);
	<main>
		<style>
			main { padding: 16px; }
			.note { background: #eef; padding: 8px; }
			.note[ui-hidden] { visibility: hidden; }
			.toggle {
				display: block;
				width: 100%;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 16px;
			}
		</style>
		<title>Visibility</title>
		<h1>Visibility</h1>
		<p class="note" ui-hidden={!shown}>Secret note</p>
		<p>Below the note</p>
		<button class="toggle" onClick={() => (shown = !shown)}>Toggle note</button>
	</main>
}
