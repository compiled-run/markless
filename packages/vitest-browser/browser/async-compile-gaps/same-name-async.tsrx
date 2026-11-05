import { computed, state } from '@markless/core';

// Two same-file components each keep an async value named `data`.
async function fetchBox(box: string, round: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { label: `${box}-${round}` };
}

function Inbox() @{
	let round = state(1);
	const data = computed(async () => fetchBox('inbox', round));

	<p data-inbox>
		<button type="button" data-round onClick={() => round++}>Round</button>
		@try { <span>{data.label}</span> } @pending { <i>wait</i> }
	</p>
}

function Outbox() @{
	const data = computed(async () => fetchBox('outbox', 0));

	<p data-outbox>@try { <span>{data.label}</span> } @pending { <i>wait</i> }</p>
}

export function App() @{
	<main>
		<Inbox />
		<Outbox />
	</main>
}
