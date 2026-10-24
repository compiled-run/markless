import { state } from '@markless/core';

type Card = { readonly code: string; readonly kind: string };

export default function SwitchRowsPage() @{
	let cards = state<readonly Card[]>([
		{ code: 'p', kind: 'note' },
		{ code: 'q', kind: 'task' },
	]);
	<ol>
		@for (const card of cards; index at; key card.code) {
			<li data-card={card.code}>
				@switch (card.kind) {
					@case 'note': {
						<>
							<em data-shown="note">{at}</em>
							<button type="button" data-to-task={card.code} onClick={() => (cards = cards.map((each) => (each.code === card.code ? { ...each, kind: 'task' } : each)))}>task</button>
						</>
					}
					@case 'task': {
						<>
							<strong data-shown="task">{card.code}</strong>
							<button type="button" data-to-done={card.code} onClick={() => (cards = cards.map((each) => (each.code === card.code ? { ...each, kind: 'done' } : each)))}>done</button>
						</>
					}
					@default: {
						<>
							<s data-shown="done">{card.kind}</s>
							<button type="button" data-to-note={card.code} onClick={() => (cards = cards.map((each) => (each.code === card.code ? { ...each, kind: 'note' } : each)))}>note</button>
						</>
					}
				}
			</li>
		}
	</ol>
}
