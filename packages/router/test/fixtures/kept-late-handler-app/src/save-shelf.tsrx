import { computed, state } from '@markless/core';

export default function SaveShelf() @{
	const names = computed(async () => {
		await Promise.resolve();
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
		<span data-save-status>{status}</span>
	</section>
}
