import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	<main>
		<Board />
	</main>
}

function Board() @{
	let round = state(0);
	let closed = state('open');

	<div>
		<p data-state>{closed}</p>
		<Editor id={3} round={round} close={(next) => (closed = next)} />
	</div>
}

function Editor({ id, round, close }: { id: number; round: number; close: (next: string) => void }) @{
	const title = computed(async () => fetchTitle(id, round));

	<section data-editor>
		@try {
			<>
				<button data-back onClick={() => close('closed')}>Back</button> Editing "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</section>
}
