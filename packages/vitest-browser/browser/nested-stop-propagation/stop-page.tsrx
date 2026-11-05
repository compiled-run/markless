import { state } from '@markless/core';

export default function StopPage() @{
	let open = state(true);
	let order = state('');

	<main>
		<button type="button" data-testid="reopen" onClick={() => (open = true)}>Open</button>
		<button type="button" data-testid="bin" onClick={() => (open = false)}>Bin</button>
		<svg viewBox="0 0 200 100" width="400" height="200">
			@if (open) {
				<g data-testid="note" onPointerDown={() => (order = order + 'note;')}>
					<rect x="40" y="20" width="80" height="60" fill="#fd6" />
					<g
						data-testid="close"
						onPointerDown={(event) => {
							event.stopPropagation();
							order = order + 'close;';
						}}
					>
						<rect data-testid="close-mark" x="100" y="22" width="16" height="16" fill="#333" />
					</g>
				</g>
			}
		</svg>
		<output data-testid="order">{order}</output>
	</main>
}
