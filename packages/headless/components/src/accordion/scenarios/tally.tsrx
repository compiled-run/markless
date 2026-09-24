import { computed, state } from '@markless/core';
import { accordion } from '../../index.ts';

const WITNESSES = [
	{ value: 'ada', title: 'Ada' },
	{ value: 'ben', title: 'Ben' },
	{ value: 'cleo', title: 'Cleo' },
];

// A page that tallies which sections were opened from the root's onChange: the
// callback both mirrors the value and appends to a list the rows derive from.
export default function Tally() @{
	const board = WITNESSES.find((witness) => witness.value === 'ada')!;
	const rows = state([...WITNESSES, { value: 'verdict', title: 'Verdict' }]);
	const tracking = state(true);
	let selected = state<string | readonly string[]>(board.value);
	let seen = state<readonly string[]>([board.value]);

	const visible = computed(() => {
		const all = rows;
		const opened = seen;
		return all.map((row) => ({
			...row,
			locked: row.value === 'verdict' && opened.length < WITNESSES.length,
			seen: opened.includes(row.value),
		}));
	});

	<section>
		<accordion.root
			data-testid="root"
			collapsible
			value={selected}
			onChange={(next: string | readonly string[]) => {
				selected = next;
				if (tracking && typeof next === 'string' && next !== '' && next !== 'verdict' && !seen.includes(next)) {
					seen = [...seen, next];
				}
			}}
		>
			@for (const row of visible; key row.value) {
				<accordion.item value={row.value} disabled={row.locked}>
					<accordion.itemlabel>
						<accordion.itemtrigger data-testid={row.value + '-trigger'}>
							{row.title}
							<span data-testid={row.value + '-seen'} hidden={!row.seen}>seen</span>
						</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent>{row.title} says hello.</accordion.itemcontent>
				</accordion.item>
			}
		</accordion.root>
		<p data-testid="tally">{seen.length} of {WITNESSES.length}</p>
		<output data-testid="selected" data-value={selected} />
	</section>
}
