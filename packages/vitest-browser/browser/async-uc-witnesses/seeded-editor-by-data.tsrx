import { computed, state } from '@markless/core';
import { loadDoc } from './seeded-docs.ts';
import { Editor } from './seeded-editor-parts.tsrx';

// The local fix Maïeul names: key by the fetched document, so the key changes with the data.
export function KeyedByData() @{
	let docId = state('a');
	const doc = computed(async () => loadDoc(docId));

	<section>
		<button type="button" data-pick-b onClick={() => (docId = 'b')}>B</button>
		@try {
			<div data-pane>
				@for (const shown of [doc]; key shown.id) {
					<Editor subject={shown.id} doc={shown} />
				}
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
