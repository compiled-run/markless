import { computed } from '@markless/core';
import HeadCard from '../src/head-card.tsrx';
import HeadNote from '../src/head-note.tsrx';
import ToggleRow from '../src/toggle-row.tsrx';
import { later } from '../src/later.ts';

export default function StreamedSections() @{
	const head = computed(async () => later({ label: 'head', href: '/item/1' }, 30));
	const note = computed(async () => later({ text: 'note' }, 60));
	const rows = computed(async () => later([{ id: 1, name: 'first' }, { id: 2, name: 'second' }], 120));
	<main>
		@try {
			<HeadCard label={head.label} href={head.href} />
		} @pending {
			<p>loading head</p>
		}
		@try {
			<HeadNote note={note.text} />
		} @pending {
			<p>loading note</p>
		}
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
