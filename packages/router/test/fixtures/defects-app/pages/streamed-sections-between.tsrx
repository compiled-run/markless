import { computed } from '@markless/core';
import HeadNote from '../src/head-note.tsrx';
import ToggleRow from '../src/toggle-row.tsrx';
import { later } from '../src/later.ts';

export default function StreamedSectionsBetween() @{
	const early = computed(async () => later([{ id: 'a', name: 'alpha' }], 90));
	const note = computed(async () => later({ text: '' }, 20));
	const late = computed(async () => later([{ id: 'b', name: 'beta' }, { id: 'c', name: 'gamma' }], 140));
	<main>
		@try {
			<ul>
				@for (const row of early; key row.id) {
					<li><ToggleRow name={row.name} /></li>
				}
			</ul>
		} @pending {
			<p>loading early</p>
		}
		<aside>
			@try {
				<HeadNote note={note.text} />
			} @pending {
				<p>loading note</p>
			}
			<small>side</small>
		</aside>
		@try {
			<ol>
				@for (const row of late; key row.id) {
					<li><ToggleRow name={row.name} /></li>
				}
			</ol>
		} @pending {
			<p>loading late</p>
		}
	</main>
}
