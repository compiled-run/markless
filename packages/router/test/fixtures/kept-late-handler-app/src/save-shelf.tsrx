import { computed, state } from '@markless/core';

export default function SaveShelf() @{
	const names = computed(async () => {
		await Promise.resolve();
		// A test holds the browser's reload here; the server render never waits.
		await (globalThis as { namesGate?: Promise<unknown> }).namesGate;
		return 'Ada';
	});
	let status = state('idle');

	<section class="save-shelf" data-save-shelf>
		@try {
			<p data-names>{names}</p>
		} @pending {
			<p>{'Loading names'}</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
		<button type="button" data-save onClick={async () => {
			status = 'saving';
			await fetch('/save', { method: 'POST', body: 'Grace' });
			status = 'saved';
		}}>{'Save'}</button>
		<form
			data-save-form
			onSubmit={async (event) => {
				event.preventDefault();
				const body = new FormData(event.currentTarget as HTMLFormElement);
				status = 'submitting';
				await fetch('/save', { method: 'POST', body: new URLSearchParams(body as unknown as Record<string, string>) });
				status = 'submitted';
			}}
		>
			<input name="name" value="Grace" />
			<button type="submit" data-submit>{'Submit'}</button>
		</form>
		<span data-save-status>{status}</span>
	</section>
}
