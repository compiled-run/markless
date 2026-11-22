import { computed, state } from '@markless/core';

export default function App() @{
	let tall = state(false);
	const grow = computed(() => (tall ? 'height: 120px;' : undefined));
	<main>
		<style>
			main {
				padding: 4px 0 12px;
				background: #f4f1ea;
			}
			.card {
				margin: 18px 20px;
				padding: 14px 16px;
				font-size: 17px;
				background: #ffffff;
				color: #22223b;
			}
			.outer {
				box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
			}
			.inset {
				box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.35);
			}
			.rounded {
				border: 2px solid #1d3557;
				border-radius: 14px;
				box-shadow: 0 4px 10px 3px rgba(30, 60, 120, 0.35);
			}
			.tap {
				display: block;
				margin: 12px 20px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
		</style>
		<h1>Box shadow</h1>
		<div class="card outer">Outer shadow</div>
		<div class="card inset">Inset shadow</div>
		<div class="card rounded" style={grow}>Rounded with spread</div>
		<button class="tap" onClick={() => (tall = !tall)}>Grow</button>
		<p>{tall ? 'Tall' : 'Short'}</p>
	</main>
}
