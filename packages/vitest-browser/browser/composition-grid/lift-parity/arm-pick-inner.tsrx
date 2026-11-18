import { state } from '@markless/core';
import type { Board } from '../grid-server.ts';

export default function ArmPickInner({ board, onPick }: { board: Board; onPick: (id: string) => void }) @{
	let open = state(true);

	<section>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<button type="button" data-pick-arm onClick={() => onPick(board.subject)}>Pick</button>
		} @else {
			<em data-g="closed">Closed</em>
		}
	</section>
}
