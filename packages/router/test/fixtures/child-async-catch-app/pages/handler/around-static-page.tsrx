import { computed, state } from '@markless/core';
import { loadThing, save } from '../../lib/save.ts';

export default function Page() @{
	let note = state('');
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<div>
				<p class="loads">loads {thing.loads}</p>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						note = 'sending';
						await save();
						note = 'saved';
					}}
				>
					<p class="note">{note}</p>
					<button type="submit" data-submit>Save</button>
					<button
						type="button"
						data-click
						onClick={async () => {
							note = 'sending';
							await save();
							note = 'saved';
						}}
					>
						Save by click
					</button>
				</form>
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p class="caught">caught: {error.message}</p>
		}
	</main>
}
