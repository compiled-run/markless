import { computed, state } from '@markless/core';

export default function App() @{
	let drop = state(20);
	const place = computed(() => `top: ${drop * 1.5}px`);
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
				font-size: 16px;
				white-space: nowrap;
			}
			.first {
				top: 100px;
			}
			.second {
				top: 200px;
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
		<h1>Length slot</h1>
		<div class="column">
			<span class="row first">Row one</span>
			<span class="row second">Row two</span>
			<span class="marker" style={place}>Marker</span>
		</div>
		<button class="tap" onClick={() => (drop = drop + 70)}>Lower</button>
		<p>Drop {drop}</p>
	</main>
}
