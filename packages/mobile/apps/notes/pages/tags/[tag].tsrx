import { computed, storage } from '@markless/core';
import { Link, type PageProps } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';
import { excerpt, parseNotes, sortNotes } from '../../lib/notes.ts';

export default function TaggedNotes({ params }: PageProps<{ tag: string }>) @{
	let saved = storage('notes', '[]');
	const notes = computed(() =>
		sortNotes(parseNotes(saved)).filter((note) => note.tag === params.tag),
	);

	<Shell title={params.tag}>
		<style>
			.list {
				display: grid;
				gap: 10px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.row {
				display: grid;
				gap: 4px;
				padding: 14px 16px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				text-decoration: none;
			}
			.row span,
			.none {
				color: var(--muted);
			}
		</style>
		<h1>{params.tag}</h1>
		<ul class="list">
			@for (const note of notes; key note.id) {
				<li>
					<Link href="/notes/[id]" params={{ id: note.id }} class="row">
						<strong>{note.title}</strong>
						<span>{excerpt(note.body)}</span>
					</Link>
				</li>
			} @empty {
				<li class="none">No notes tagged {params.tag}</li>
			}
		</ul>
	</Shell>
}
