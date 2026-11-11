import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	<main>
		<Shelf name="near" />
		<Shelf name="far" />
	</main>
}

function Shelf({ name }: { name: string }) @{
	let round = state(1);
	let status = state('open');

	<article data-board={name}>
		<p data-state>{status}</p>
		<Drawer id={7} round={round} done={(next) => (status = next)} />
	</article>
}

function Drawer({ id, round, done }: { id: number; round: number; done: (next: string) => void }) @{
	const title = computed(async () => fetchTitle(id, round));

	<aside>
		@try {
			<>
				<button data-back onClick={() => done('closed')}>Done</button> Viewing "{title}"
			</>
		} @pending {} @catch {}
	</aside>
}
