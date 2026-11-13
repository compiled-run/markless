import type { Board } from '../grid-server.ts';

export default function PickInner({ board, onPick }: { board: Board; onPick: (id: string) => void }) @{
	<ul>
		@for (const row of board.items; key row.id) {
			<li>
				<button type="button" data-pick={row.id} onClick={() => onPick(row.id)}>{row.label}</button>
			</li>
		}
	</ul>
}
