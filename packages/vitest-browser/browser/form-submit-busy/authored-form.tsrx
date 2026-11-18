import { state } from '@markless/core';
import { addItem } from '../mutations-refresh/server.ts';

export function AuthoredForm() @{
	let locked = state(false);

	<section>
		<form
			data-bound-form
			onSubmit={async (event) => {
				event.preventDefault();
				await addItem('bound');
			}}
		>
			<button type="submit" aria-disabled={locked ? 'true' : 'false'} data-bound>Save</button>
			<button type="submit" data-unbound>Save a copy</button>
		</form>
		<button type="button" data-lock onClick={() => (locked = !locked)}>Lock</button>
		<form
			data-static-form
			onSubmit={async (event) => {
				event.preventDefault();
				await addItem('static');
			}}
		>
			<button type="submit" aria-disabled="true" data-static>Send</button>
		</form>
	</section>
}
