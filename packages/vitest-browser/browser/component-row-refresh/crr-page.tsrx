import { computed, state } from '@markless/core';

// A child that renders its props straight into DOM attributes: nothing in it is live, so only a row re-render can move them.
function Entry({ label, locked, seen, onPick }) @{
	<li data-entry={label}>
		<button data-go={label} disabled={locked} onClick={(event) => onPick(event.currentTarget.getAttribute('data-go'))}>{label}</button>
		<span data-seen={label} hidden={!seen}>seen</span>
	</li>
}

export default function Page() @{
	let opened = state(['ada']);
	let picked = state('none');
	const entries = state([{ id: 'ada' }, { id: 'ben' }, { id: 'last' }]);
	const visible = computed(() =>
		entries.map((entry) => ({
			...entry,
			locked: entry.id === 'last' && opened.length < 2,
			seen: opened.includes(entry.id),
		})),
	);

	<main>
		<output data-picked>{picked}</output>
		<ul>
			@for (const entry of visible; key entry.id) {
				<Entry
					label={entry.id}
					locked={entry.locked}
					seen={entry.seen}
					onPick={(label) => {
						picked = label;
						if (!opened.includes(label)) opened = [...opened, label];
					}}
				/>
			}
		</ul>
	</main>
}
