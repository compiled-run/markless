import { state } from '@markless/core';
import { art } from '../drawing-art.ts';

export default function Drawing() @{
	let open = state(false);
	let picked = state('');

	<main>
		<button data-flip onClick={() => (open = !open)}>Flip</button>
		@if (open) {
			<svg class="open"><path class="ink" d={art.ink} /></svg>
		} @else {
			<p class="closed">Closed</p>
		}
		<ul>
			@for (const piece of art.pieces; key piece.id) {
				<li data-piece={piece.id} onClick={() => (picked = piece.id)}><svg><path d={piece.d} /></svg></li>
			}
		</ul>
		<output>{picked}</output>
	</main>
}
