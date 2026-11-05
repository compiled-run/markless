import { computed, state } from '@markless/core';
import { lookUpBalance } from './fetch-shelf.ts';

export function Note({ title }: { title: string }) @{
	let open = state(false);
	const detail = computed(async () => await lookUpBalance(title, 0));

	<div data-note={title}>
		<button data-note-toggle onClick={() => (open = !open)}>{title}</button>
		@if (open) {
			<div data-note-body>
				@try {
					<span data-note-detail>{detail}</span>
				} @pending {
					<i data-note-pending>opening</i>
				}
			</div>
		}
	</div>
}
