import { computed, state } from '@markless/core';

export default function App() @{
	let open = state(true);
	let share = state(10);
	const place = computed(() => `top: ${share * 2}px;`);
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
			}
			.marker {
				position: absolute;
				right: 8px;
				font-size: 16px;
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
		<h1>Slot in an arm</h1>
		<div class="column">
			<span class="row">Middle row</span>
			@if (open) {
				<span class="marker" style={place}>Marker</span>
			}
		</div>
		<button class="tap" onClick={() => (share = share + 100)}>Lower</button>
		<button class="tap" onClick={() => (open = !open)}>Toggle</button>
	</main>
}
