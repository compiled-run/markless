import { state } from '@markless/core';

export default function App() @{
	let taps = state(0);
	<main>
		<style>
			.dashed {
				margin: 12px;
				padding: 12px;
				border: 3px dashed #22223b;
			}
			.dotted {
				margin: 12px;
				padding: 12px;
				border: 4px dotted #ef476f;
			}
			.mixed {
				margin: 12px;
				padding: 12px;
				border-top: 2px dashed #2a9d8f;
				border-right: 6px dotted #22223b;
				border-bottom: 2px solid #2a9d8f;
				border-left: 6px dashed #8d99ae;
			}
			.tap {
				display: block;
				margin: 12px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				background: #e9ecef;
				color: #22223b;
			}
		</style>
		<h1>Borders</h1>
		<div class="dashed">Dashed all round</div>
		<div class="dotted">Dotted all round</div>
		<div class="mixed">Mixed sides</div>
		<button class="tap" onClick={() => (taps = taps + 1)}>Tap</button>
		<p>Taps {taps}</p>
	</main>
}
