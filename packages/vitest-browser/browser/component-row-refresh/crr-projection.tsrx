import { computed, state } from '@markless/core';

function Card({ label, locked, children }) @{
	<li data-card={label}>
		<button data-card-go={label} disabled={locked}>{label}</button>
		{children}
	</li>
}

// The page's own elements ride inside every row through `children`: one reads page
// state, one reads the row's item, one handles a click.
export default function Projection() @{
	let opened = state(['ada']);
	let clicks = state(0);
	const entries = state([{ id: 'ada' }, { id: 'ben' }, { id: 'last' }]);
	const visible = computed(() =>
		entries.map((entry) => ({
			...entry,
			locked: entry.id === 'last' && opened.length < 2,
			seen: opened.includes(entry.id),
		})),
	);

	<main>
		<button data-open-ben onClick={() => opened = [...opened, 'ben']}>Open ben</button>
		<output data-clicks>{clicks}</output>
		<ul>
			@for (const entry of visible; key entry.id) {
				<Card label={entry.id} locked={entry.locked}>
					<span data-count={entry.id}>{opened.length} opened</span>
					<em data-stamp={entry.id} hidden={!entry.seen}>seen</em>
					<i data-tap={entry.id} onClick={() => clicks = clicks + 1}>tap</i>
				</Card>
			}
		</ul>
	</main>
}
