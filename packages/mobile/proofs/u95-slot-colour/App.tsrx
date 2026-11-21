import { computed, state } from '@markless/core';

export default function App() @{
	let warm = state(40);
	const tone = computed(() => `--tone: rgb(${warm} 90 ${255 - warm})`);
	<main>
		<style>
			.swatch {
				margin: 12px;
				padding: 16px;
				font-size: 18px;
				color: #ffffff;
				background-color: var(--tone, black);
				border: 4px solid var(--tone, black);
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
		<h1>Colour slot</h1>
		<div class="swatch" style={tone}>Swatch</div>
		<button class="tap" onClick={() => (warm = warm + 100)}>Warmer</button>
		<p>Warm {warm}</p>
	</main>
}
