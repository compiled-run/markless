import { computed, state } from '@markless/core';
import { accordion } from '../../index.ts';

const SUSPECTS = [
	{ value: 'ada', title: 'Ada', lines: ['home|nine', 'shop|ten'] },
	{ value: 'ben', title: 'Ben', lines: ['bakery|eight'] },
	{ value: 'cleo', title: 'Cleo', lines: [] },
];

// Rows whose projected markup reads the row, reads page state, holds a static list
// of its own and handles a click - the shape of a case file of alibis.
export default function Alibis() @{
	const entries = state([...SUSPECTS, { value: 'culprit', title: 'Name the culprit', lines: [] }]);
	let selected = state<string | readonly string[]>('');
	let read = state<readonly string[]>([]);
	let answer = state('');
	const visible = computed(() => {
		const all = entries;
		const done = read;
		return all.map((entry) => ({
			...entry,
			locked: entry.value === 'culprit' && done.length < SUSPECTS.length,
			read: done.includes(entry.value),
		}));
	});

	<accordion.root
		collapsible
		value={selected}
		onChange={(next: string | readonly string[]) => {
			selected = next;
			if (typeof next === 'string' && next !== '' && next !== 'culprit' && !read.includes(next)) read = [...read, next];
		}}
	>
		@for (const entry of visible; key entry.value) {
			<accordion.item value={entry.value} disabled={entry.locked}>
				<accordion.itemlabel>
					<accordion.itemtrigger data-alibi={entry.value}>
						{entry.title}
						<span class="count" hidden={entry.value !== 'culprit'}>{read.length} of 3 read</span>
						<span data-stamp={entry.value} hidden={!entry.read}>READ</span>
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>
					<dl hidden={entry.lines.length === 0}>@for (const line of entry.lines; key line) { <div><dt>{line.split('|')[0]}</dt><dd>{line.split('|')[1]}</dd></div> }</dl>
					<div class="choices" hidden={entry.value !== 'culprit'} onClick={(event: MouseEvent) => {
						const choice = (event.target as Element).closest('button')?.value;
						if (choice) answer = choice === 'ben' ? 'Case closed' : 'Try again';
					}}>@for (const suspect of SUSPECTS; key suspect.value) { <button type="button" value={suspect.value} data-choose={suspect.value}>{suspect.title}</button> }</div>
					<p data-answer>{answer}</p>
				</accordion.itemcontent>
			</accordion.item>
		}
	</accordion.root>
}
