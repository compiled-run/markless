import { computed, state } from '@markless/core';
import { loadDoc } from './seeded-docs.ts';
import { Editor } from './seeded-editor-parts.tsrx';

// Maïeul's shape: the key follows the picked id, the prop carries the fetched document.
export function KeyedByInput() @{
	let docId = state('a');
	const doc = computed(async () => loadDoc(docId));

	<section>
		<button type="button" data-pick-b onClick={() => (docId = 'b')}>B</button>
		@try {
			<div data-pane>
				@for (const id of [docId]; key id) {
					<Editor subject={id} doc={doc} />
				}
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
