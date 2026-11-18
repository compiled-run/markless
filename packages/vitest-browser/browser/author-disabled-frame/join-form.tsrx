import { state } from '@markless/core';
import { addItem } from '../mutations-refresh/server.ts';

export function JoinForm() @{
	let sending = state(false);

	<main>
		<form
			data-form
			onSubmit={async (event) => {
				event.preventDefault();
				sending = true;
				try {
					await addItem('ada@example.com');
				} finally {
					sending = false;
				}
			}}
		>
			<input data-field name="email" />
			<button data-join type="submit" aria-disabled={sending ? true : undefined}>Join</button>
		</form>
	</main>
}
