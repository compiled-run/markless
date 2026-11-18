import { state } from '@markless/core';

type Group = { id: string; open: boolean; notes: Array<{ id: string; text: string }> };
const groupsAt = (count: number, open: boolean): Array<Group> => [
	{ id: 'g', open, notes: ['a', 'b', 'c', 'd'].slice(0, count).map((id) => ({ id, text: `note ${id}` })) },
];

export default function RowArms() @{
	let count = state(0);
	let open = state(true);
	let groups = state<Array<Group>>(groupsAt(0, true));

	<article>
		<button type="button" data-more onClick={() => { count++; groups = groupsAt(count, open); }}>More</button>
		<button type="button" data-toggle onClick={() => { open = !open; groups = groupsAt(count, open); }}>Toggle</button>
		<div>
			@for (const group of groups; key group.id) {
				<section>
					@if (group.open && group.notes.length > 0) {
						<ul data-list>
							@for (const note of group.notes; key note.id) {
								<li>{note.text}</li>
							}
						</ul>
					}
				</section>
			}
		</div>
	</article>
}
