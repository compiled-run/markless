import { state } from '@markless/core';

export default function StopHtmlPage() @{
	let open = state(true);
	let order = state('');

	<main>
		<button type="button" data-testid="reopen" onClick={() => (open = true)}>Open</button>
		<button type="button" data-testid="bin" onClick={() => (open = false)}>Bin</button>
		<div data-testid="plain" onPointerDown={() => (order = order + 'plain;')}>
			<span
				data-testid="plain-mark"
				onPointerDown={(event) => {
					event.stopPropagation();
					order = order + 'inner;';
				}}
			>
				x
			</span>
		</div>
		@if (open) {
			<div data-testid="note" onPointerDown={() => (order = order + 'note;')}>
				<span
					data-testid="close-mark"
					onPointerDown={(event) => {
						event.stopPropagation();
						order = order + 'close;';
					}}
				>
					x
				</span>
			</div>
		}
		<output data-testid="order">{order}</output>
	</main>
}
