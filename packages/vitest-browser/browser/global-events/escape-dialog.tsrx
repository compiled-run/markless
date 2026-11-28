import { state } from '@markless/core';
import { logKey } from './key-log.ts';

export function App() @{
	let open = state(true);
	let closes = state(0);

	<main>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<output data-closes>{closes}</output>
		@if (open) {
			<dialog
				open
				data-dialog
				onDocumentKeyDown={(event) => {
					logKey('__globalKeyRuns', event.key);
					if (event.key === 'Escape') {
						open = false;
						closes++;
					}
				}}
			>
				Press Escape
			</dialog>
		}
	</main>
}
