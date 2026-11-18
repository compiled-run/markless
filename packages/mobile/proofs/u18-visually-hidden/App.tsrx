import { state } from '@markless/core';
import { base } from '@markless/ui';

export default function App() @{
	let taps = state(0);
	<main>
		<style>
			.card {
				padding: 12px;
				margin: 12px 0;
				border: 2px solid #22223b;
				background: #e9ecef;
				color: #22223b;
			}
			.tap {
				display: block;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
		</style>
		<h1>Hidden text</h1>
		<div class="card">
			<p>Shown above</p>
			<base.visuallyhidden>Read by the screen reader only</base.visuallyhidden>
			<p>Taps {taps}</p>
		</div>
		<button class="tap" onClick={() => (taps = taps + 1)}>Tap</button>
	</main>
}
