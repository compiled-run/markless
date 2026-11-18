import { computed, state } from '@markless/core';
import { loadMugs, saveMug } from './mugs.ts';

export function MugShelf() @{
	let reload = state(0);
	const mugs = computed(async () => {
		reload;
		return await loadMugs();
	});

	<section>
		<button data-reload onClick={() => reload++}>Reload</button>
		<button data-add onClick={async () => {
			await saveMug('tall');
			reload++;
		}}>Add a tall mug</button>
		@try {
			<ul data-mugs>
				@for (const mug of mugs; key mug.id) {
					<li>{mug.name}</li>
				}
			</ul>
		} @pending {
			<p>Counting mugs</p>
		}
	</section>
}
