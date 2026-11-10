import { computed, state } from '@markless/core';
import { saveTodo, type Draft } from './save-api.ts';

function SavingTodoWhole({ draft }: { draft: Draft }) @{
	const saved = computed(async () => await saveTodo(draft));

	<li data-row data-saving-row data-id={draft.id}>
		@try {
			<span data-confirmed>{saved.title}</span>
		} @pending {
			<span data-optimistic>{draft.title}</span>
		} @catch (error, reset) {
			<span data-failed>
				{draft.title}: couldn't save <button type="button" data-retry onClick={reset}>Retry</button>
			</span>
		}
	</li>
}

export default function Todos({ listId, reload }: { listId: string; reload: number }) @{
	let title = state('');
	let drafts = state<Draft[]>([]);

	<div data-todos data-list-id={listId} data-reload={reload}>
		<input data-title value={title} onInput={(event) => (title = (event.target as HTMLInputElement).value)} />
		<button
			type="button"
			data-add
			onClick={() => {
				const value = title.trim();
				if (!value) return;
				drafts = [...drafts, { id: `${listId}-${crypto.randomUUID()}`, title: value }];
				title = '';
			}}
		>
			Add
		</button>
		<ul data-list>
			@for (const draft of drafts; key draft.id) {
				<SavingTodoWhole draft={draft} />
			}
		</ul>
	</div>
}
