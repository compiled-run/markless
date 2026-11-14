import { computed, state } from '@markless/core';
import { loadItem, saveNote } from './api.ts';
import CatchPanel from './catch-panel.tsrx';

// The save button sits under the page's @catch; the arm's component, beside it, has a @catch of its own.
export default function SaveCatchPage() @{
	let open = state<number | null>(1);
	const shelf = computed(async ({ signal }) => await loadItem('shelf', 0, signal));

	<div>
		<button type="button" data-open onClick={() => (open = 1)}>Open</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		@try {
			<section>
				<p data-shelf>{shelf.name}</p>
				<button type="button" data-save onClick={async () => await saveNote('kept')}>Save</button>
			</section>
		} @pending {
			<p data-shelf-loading>Loading</p>
		} @catch (error) {
			<p data-page-failed>{error.message}</p>
		}
		@if (open !== null) {
			<CatchPanel tag="save" id={open} />
		}
	</div>
}
