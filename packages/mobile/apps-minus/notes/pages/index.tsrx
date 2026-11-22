import { computed, state, storage } from '@markless/core';
import { Link } from '@markless/router';
import Shell from '../lib/Shell.tsrx';
import { excerpt, formatDate, matches, parseNotes, sortNotes } from '../lib/notes.ts';

export default function AllNotes() @{
	let saved = storage('notes', '[{"id":"n1","title":"Groceries","body":"Milk and eggs","tag":"Personal","pinned":false,"updated":"2026-11-22T10:00:00.000Z"}]');
	let query = state('');
	const notes = computed(() => sortNotes(parseNotes(saved)));
	const shown = computed(() => notes.filter((note) => matches(note, query)));

	<Shell title="All notes">
		<style>
			.empty {
				display: grid;
				justify-items: center;
				gap: 12px;
				padding: 64px 20px;
				text-align: center;
				color: var(--muted);
			}
			.empty h1 {
				color: var(--ink);
			}
			.search {
				width: 100%;
				margin-bottom: 18px;
				padding: 12px 16px;
				border: 1px solid var(--line);
				border-radius: 999px;
				background: var(--card);
			}
			.list {
				display: grid;
				gap: 12px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			@media (min-width: 700px) {
				.list {
					grid-template-columns: repeat(2, 1fr);
				}
			}
			.card {
				display: grid;
				gap: 6px;
				height: 100%;
				padding: 16px 18px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				box-shadow: var(--shadow);
				text-decoration: none;
			}
			.card strong {
				font-size: 18px;
			}
			.excerpt {
				color: var(--muted);
			}
			.meta {
				display: flex;
				gap: 8px;
				font-size: 13px;
				color: var(--muted);
			}
			.none {
				padding: 24px;
				color: var(--muted);
			}
		</style>
		@if (notes.length === 0) {
			<section class="empty">
				<h1>No notes yet</h1>
				<p>Notes you write stay on this device.</p>
				<Link href="/new" class="button primary">
					Write your first note
				</Link>
			</section>
		} @else {
			<>
				<h1>All notes</h1>
				<ul class="list">
					@for (const note of shown; key note.id) {
						<li>
							<Link href="/notes/[id]" params={{ id: note.id }} class="card">
								<strong>{note.title}</strong>
								<span class="excerpt">{excerpt(note.body)}</span>
								<span class="meta">
									{note.pinned ? 'Pinned · ' : ''}
									{note.tag} · {formatDate(note.updated)}
								</span>
							</Link>
						</li>
					}
				</ul>
				<p class="none" hidden={shown.length > 0}>
					No notes match “{query}”
				</p>
			</>
		}
	</Shell>
}
