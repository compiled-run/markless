import { computed, state } from '@markless/core';

export default function App() @{
	let low = state(false);
	const place = computed(() => (low ? 'top: 240px' : 'top: 20px'));
	<main>
		<style>
			.column {
				position: relative;
				height: 320px;
				margin: 0 12px;
				background: #edf2f4;
			}
			.row {
				position: absolute;
				left: 8px;
				top: 140px;
				font-size: 16px;
				white-space: nowrap;
			}
			.marker {
				position: absolute;
				right: 8px;
				font-size: 16px;
				white-space: nowrap;
				background: #ef476f;
				color: #ffffff;
			}
			.tap {
				display: block;
				margin: 12px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
		</style>
		<h1>Chosen style</h1>
		<div class="column">
			<span class="row">Middle row</span>
			<span class="marker" style={place}>Marker</span>
		</div>
		<button class="tap" onClick={() => (low = !low)}>Swap</button>
		<p>{low ? 'Low' : 'High'}</p>
	</main>
}
