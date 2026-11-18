import type { Board } from '../grid-server.ts';

export default function ModeInner({ mode, board }: { mode: string; board: Board }) @{
	<section>
		@if (mode === 'list') {
			<ul>
				@for (const row of board.items; key row.id) {
					<li data-g="row">{row.label}</li>
				}
			</ul>
		} @else {
			<p data-g="grid">Grid</p>
		}
	</section>
}
