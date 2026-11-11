import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	<main>
		<Board name="left" />
		<Board name="right" />
	</main>
}

function Board({ name }: { name: string }) @{
	let round = state(0);
	let editing = state<number | null>(null);

	<div data-board={name}>
		<button data-open onClick={() => (editing = 3)}>Open</button>
		@if (editing !== null) {
			<Editor id={editing} round={round} close={(next) => (editing = next)} />
		}
	</div>
}

function Editor({ id, round, close }: { id: number; round: number; close: (next: number | null) => void }) @{
	const title = computed(async () => fetchTitle(id, round));

	<section data-editor>
		@try {
			<>
				<button data-back onClick={() => close(null)}>Back</button> Editing "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</section>
}
