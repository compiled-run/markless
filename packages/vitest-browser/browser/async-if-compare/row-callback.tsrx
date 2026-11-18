import { computed, state } from '@markless/core';

type Note = { id: string; text: string };

function Row({ note, onPick }: { note: Note; onPick: (pick: { note: Note; n: number }) => void }) @{
	<li>
		<button type="button" data-pick onClick={() => onPick({ note, n: 1 })}>pick {note.text}</button>
	</li>
}

export default function PickList() @{
	const notes = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
		return [{ id: 'a', text: 'note a' }];
	});
	let open = state(false);
	let picked = state('none');

	<main>
		<p data-picked>{picked}</p>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		@try {
			<div>
				@if (open && notes.length > 0) {
					<ul>
						@for (const note of notes; key note.id) {
							<Row note={note} onPick={(pick) => (picked = `${pick.note?.text}:${pick.n}`)} />
						}
					</ul>
				}
			</div>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
