import { state } from '@markless/core';
import Panel from './panel.tsrx';

// The arm's owner is handed the value its panel loads, and sits in the same file as the page.
function HandedOwner({ id, start }: { id: number; start: boolean }) @{
	let open = state(start);

	<div>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-close onClick={() => (open = false)}>Close</button>
		@if (open) {
			<Panel tag="handed" id={id} />
		}
	</div>
}

export function HandedPage({ start }: { start: boolean }) @{
	let id = state(1);

	<main>
		<button type="button" data-next onClick={() => id++}>Next</button>
		<HandedOwner id={id} start={start} />
	</main>
}

export default function HandedOpenPage() @{
	<HandedPage start={true} />
}
