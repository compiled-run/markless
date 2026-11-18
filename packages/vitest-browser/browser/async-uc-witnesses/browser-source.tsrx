import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

// The position exists only in the browser: the first answer shows none, then the shown element's attach asks for it.
export function BrowserSource() @{
	let located = state(false);
	const position = computed(async () => (located ? answer('position', 'Oslo') : null));

	<section>
		@try {
			<p data-place attach={() => { located = true; }} onVisible={() => {}}>{position ?? 'No position yet'}</p>
		} @pending {
			<p data-pending>Locating</p>
		}
	</section>
}
