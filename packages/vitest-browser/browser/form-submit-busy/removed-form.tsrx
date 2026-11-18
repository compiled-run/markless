import { state } from '@markless/core';
import { addItem } from '../mutations-refresh/server.ts';

export function RemovedForm() @{
	let open = state(true);

	<section>
		@if (open) {
			<form
				data-form
				onSubmit={async (event) => {
					event.preventDefault();
					open = false;
					await addItem('gone');
				}}
			>
				<button type="submit" data-submit>Send</button>
			</form>
		}
		<button type="button" data-reopen onClick={() => (open = true)}>Again</button>
	</section>
}
