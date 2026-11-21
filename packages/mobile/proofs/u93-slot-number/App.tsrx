import { computed, state } from '@markless/core';

export default function App() @{
	let grow = state(0);
	const spacer = computed(() => `--grow: ${grow / 2}`);
	<main>
		<style>
			.column {
				position: relative;
				display: flex;
				flex-direction: column;
				height: 320px;
				margin: 0 12px;
				background: #edf2f4;
			}
			.label {
				font-size: 16px;
				white-space: nowrap;
			}
			.spacer {
				flex: var(--grow, 0) 1 0;
			}
			.rest {
				flex: 1 1 0;
			}
			.mark {
				position: absolute;
				top: 150px;
				right: 8px;
				font-size: 16px;
				white-space: nowrap;
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
		<h1>Number slot</h1>
		<div class="column" style={spacer}>
			<span class="label">Top label</span>
			<div class="spacer"></div>
			<span class="label">End label</span>
			<div class="rest"></div>
			<span class="mark">Middle mark</span>
		</div>
		<button class="tap" onClick={() => (grow = grow + 6)}>Grow</button>
		<p>Grow {grow}</p>
	</main>
}
