import { state } from '@markless/core';

function cn(...parts: Array<string | false | undefined>): string {
	return parts.filter(Boolean).join(' ');
}

export default function App() @{
	const shown = state({ loud: false });
	<main class="screen">
		<style>
			.screen {
				padding: 24px;
			}
			.note {
				color: #444444;
			}
			.note.loud {
				font-weight: 700;
				font-size: 24px;
				color: #8a1c1c;
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
		<h1>Helper classes</h1>
		<p class={cn('note', shown.loud && 'loud')}>{shown.loud ? 'Loud note' : 'Quiet note'}</p>
		<button class="tap" onClick={() => (shown.loud = !shown.loud)}>Toggle loud</button>
	</main>
}
