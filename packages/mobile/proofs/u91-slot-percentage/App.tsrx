import { computed, state } from '@markless/core';

export default function App() @{
	let share = state(10);
	const place = computed(() => `--share: ${share}%`);
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
			.place {
				top: var(--share, 0%);
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
		<h1>Percentage slot</h1>
		<div class="column" style={place}>
			<span class="row first">Row one</span>
			<span class="row second">Row two</span>
			<span class="marker place">Marker</span>
		</div>
		<button class="tap" onClick={() => (share = share + 40)}>Lower</button>
		<p>Share {share}</p>
	</main>
}
