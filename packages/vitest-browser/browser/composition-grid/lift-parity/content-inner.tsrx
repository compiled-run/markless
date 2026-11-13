import { state } from '@markless/core';
import type { Board } from '../grid-server.ts';

export default function ContentInner({ board }: { board: Board }) @{
	let open = state(true);

	<section>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		<p data-g="text">
			@if (open) {
				<>{board.title}</>
			} @else {
				<>closed</>
			}
		</p>
	</section>
}
