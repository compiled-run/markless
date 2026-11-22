import { state } from '@markless/core';

export default function App() @{
	let lifted = state(0);
	let later = state(0);
	<main>
		<style>
			main { padding: 16px; }
			.card { padding: 12px; border: 1px solid #c9c2b4; border-radius: 12px; background: #fbf8f1; }
			.actions { display: flex; gap: 8px; }
			.lifted {
				position: relative;
				z-index: 1;
				top: 96px;
				padding: 10px 16px;
				border: 2px solid #1d4ed8;
				border-radius: 10px;
				background: #dbeafe;
				color: #1e3a8a;
				font-family: inherit;
				font-size: 16px;
			}
			.footer { margin: 12px 0 0; color: #6b645a; }
			.later {
				display: block;
				width: 100%;
				height: 96px;
				margin-top: 12px;
				padding: 0 0 8px 0;
				border: 0;
				background: #fde68a;
				color: #78350f;
				font-family: inherit;
				font-size: 16px;
				text-align: right;
				vertical-align: bottom;
			}
		</style>
		<title>Re-hosted</title>
		<h1>Re-hosted</h1>
		<div class="card">
			<div class="actions">
				<button class="lifted" onClick={() => (lifted = lifted + 1)}>Lifted {lifted}</button>
			</div>
			<p class="footer">Card footer</p>
		</div>
		<button class="later" onClick={() => (later = later + 1)}>Later {later}</button>
	</main>
}
