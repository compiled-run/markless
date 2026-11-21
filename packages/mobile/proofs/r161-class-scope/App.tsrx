import { state } from '@markless/core';

export default function App() @{
	const shown = state({ open: false, loud: false });
	<main class="screen">
		<style>
			.screen {
				padding: 24px;
			}
			.shut {
				color: #8a8a8a;
			}
			.open {
				color: #1b6b2e;
			}
			.note.loud {
				font-weight: 700;
				font-size: 24px;
			}
			.tap {
				display: block;
				font-family: inherit;
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font-size: 18px;
			}
		</style>
		<h1>Notes</h1>
		<p class={shown.open ? 'open' : 'shut'}>{shown.open ? 'Door open' : 'Door shut'}</p>
		<p class={`note ${shown.loud ? 'loud' : 'quiet'}`}>{shown.loud ? 'Loud note' : 'Quiet note'}</p>
		<button class="tap" onClick={() => (shown.open = !shown.open)}>Toggle door</button>
		<button class="tap" onClick={() => (shown.loud = !shown.loud)}>Toggle loud</button>
	</main>
}
