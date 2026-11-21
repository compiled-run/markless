import { state } from '@markless/core';

export default function App() @{
	let locked = state(false);
	let sent = state(0);
	<main>
		<style>
			.row {
				display: flex;
				gap: 8px;
				padding: 8px 0;
			}
			.btn {
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #e9ecef;
			}
			.btn:disabled {
				border-color: #adb5bd;
			}
		</style>
		<h1>Disabled</h1>
		<div class="row">
			<button class="btn" type="button" disabled={locked} onClick={() => (sent = sent + 1)}>
				Send
			</button>
			<button class="btn" type="button" onClick={() => (locked = !locked)}>
				Lock
			</button>
		</div>
		<p>Sent {sent}</p>
		<p>Send is {locked ? 'locked' : 'open'}</p>
	</main>
}
