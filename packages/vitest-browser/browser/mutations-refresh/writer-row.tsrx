import { computed, state } from '@markless/core';
import { addItem, loadItems } from './server.ts';

function saveDraft(name: string): Promise<{ name: string }> {
	return fetch('/mut/items', { method: 'POST', body: name }).then(() => ({ name }));
}

// An async value whose recipe sends the write itself: a refresh must never send it again.
function SavingRow({ name }: { name: string }) @{
	const saved = computed(async () => await saveDraft(name));

	<li data-saving>
		@try {
			<span data-saved>{saved.name}</span>
		} @pending {
			<span data-draft>{name}</span>
		}
	</li>
}

export function WriterRows() @{
	let drafts = state<string[]>([]);
	const shelf = computed(async () => await loadItems());

	<main>
		<button type="button" data-draft-add onClick={() => (drafts = [...drafts, 'Draft'])}>Draft</button>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
		@try {
			<p data-names>{shelf.items.join(', ')}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		<ul>
			@for (const name of drafts; key name) {
				<SavingRow name={name} />
			}
		</ul>
	</main>
}
