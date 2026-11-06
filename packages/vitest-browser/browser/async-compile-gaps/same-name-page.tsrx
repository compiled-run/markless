import { state } from '@markless/core';

// Each same-file child below is declared first and takes a prop named like a page value.
function Chip({ entries }: { entries: string }) @{
	<em data-chip>{entries}</em>
}

function Note({ count }: { count: string }) @{
	<small data-note>{count}</small>
}

function Lamp({ held }: { held: boolean }) @{
	<i data-lamp>{held ? 'held' : 'free'}</i>
}

export function App() @{
	let entries = state(['a', 'b']);
	let held = state(true);
	let other = state(false);

	<main>
		<button type="button" data-add onClick={() => (entries = [...entries, 'c'])}>Add</button>
		<ul data-entries>
			@for (const entry of entries; key entry) {
				<li>{entry}</li>
			}
		</ul>
		<a href="#onward" data-onward onClick={(event) => { if (held) event.preventDefault(); }}>Onward</a>
		<button type="button" data-release onClick={() => (held = false)}>Release</button>
		<Chip entries="chip" />
		<Note count={String(entries.length)} />
		<Lamp held={other} />
	</main>
}
