import { state } from '@markless/core';

// The child, declared first, takes a prop named like the state the page's link policy reads.
function Beacon({ blocked }: { blocked: boolean }) @{
	<b data-beacon>{blocked ? 'on' : 'off'}</b>
}

export function App() @{
	let blocked = state(true);
	let shown = state(false);

	<nav>
		<a href="#elsewhere" data-go onClick={(event) => { if (blocked === true) event.preventDefault(); }}>Go</a>
		<button type="button" data-unblock onClick={() => (blocked = false)}>Unblock</button>
		<Beacon blocked={shown} />
	</nav>
}
