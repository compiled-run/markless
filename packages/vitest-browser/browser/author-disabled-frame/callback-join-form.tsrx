import { state } from '@markless/core';
import { addItem } from '../mutations-refresh/server.ts';

function JoinCard({ onStatus }: { onStatus: (status: string) => void }) @{
	let sending = state(false);

	<section>
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			sending = true;
			onStatus('Sending');
			try {
				await addItem('Grace');
			} finally {
				sending = false;
				onStatus('');
			}
		}}
	>
		<button data-join type="submit" aria-disabled={sending ? 'true' : undefined}>Join</button>
	</form>
	<button data-warm type="button" onClick={() => (sending = !sending)}>Warm</button>
	</section>
}

export function CallbackJoinForm() @{
	let status = state('');

	<main>
		<JoinCard onStatus={(next) => (status = next)} />
		<p data-status>{status}</p>
	</main>
}
