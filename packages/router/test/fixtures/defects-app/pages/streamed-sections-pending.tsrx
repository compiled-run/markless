import { computed } from '@markless/core';
import HeadNote from '../src/head-note.tsrx';
import ToggleRow from '../src/toggle-row.tsrx';
import { later } from '../src/later.ts';

export default function StreamedSectionsPending() @{
	const head = computed(async () => later({ title: 'head' }, 30));
	const rows = computed(async () => later([{ id: 1, name: 'first' }, { id: 2, name: 'second' }], 120));
	<main>
		<header>
			@try {
				<h1>{head.title}</h1>
			} @pending {
				<HeadNote note="waiting" />
			}
			<small>after head</small>
		</header>
		@try {
			<div data-rows>
				@for (const row of rows; key row.id) {
					<ToggleRow name={row.name} />
				}
			</div>
		} @pending {
			<p>loading rows</p>
		}
	</main>
}
