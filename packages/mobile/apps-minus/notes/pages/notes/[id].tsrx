import { computed, state, storage } from '@markless/core';
import { Link, navigate, type PageProps } from '@markless/router';
import { modal } from '@markless/ui';
import Shell from '../../lib/Shell.tsrx';
import { formatDate, paragraphs, parseNotes, removeNote } from '../../lib/notes.ts';

export default function NoteDetail({ params }: PageProps<{ id: string }>) @{
	let saved = storage('notes', '[{"id":"n1","title":"Groceries","body":"Milk and eggs","tag":"Personal","pinned":false,"updated":"2026-11-22T10:00:00.000Z"}]');
	let confirming = state(false);
	const note = computed(() => parseNotes(saved).find((entry) => entry.id === params.id));
	const title = computed(() => (note ? note.title : 'Note not found'));

	<Shell title={title}>
		<style>
			.note {
				display: grid;
				gap: 16px;
				padding: 24px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
			}
			.meta {
				color: var(--muted);
				font-size: 14px;
			}
			.body p {
				margin: 0 0 12px;
			}
			.actions {
				display: flex;
				flex-wrap: wrap;
				gap: 10px;
			}
			.backdrop:not([hidden]) {
				position: fixed;
				inset: 0;
				display: grid;
				place-items: center;
				padding: 20px;
				background: rgb(0 0 0 / 0.45);
			}
			.dialog {
				display: grid;
				gap: 12px;
				width: min(420px, 100%);
				padding: 24px;
				border-radius: var(--radius);
				background: var(--card);
			}
			.dialog-title {
				margin: 0;
				font-size: 20px;
				font-weight: 600;
			}
			.dialog-actions {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
			}
			.missing {
				padding: 48px 0;
				text-align: center;
			}
		</style>
		@if (note) {
			<article class="note">
				<div>
					<h1>{note.title}</h1>
					<p class="meta">
						{note.tag} · Edited {formatDate(note.updated)}
					</p>
				</div>
				<div class="body">
					@for (const line of paragraphs(note.body); index i; key i) {
						<p>{line}</p>
					}
				</div>
				<div class="actions">
					<Link href="/notes/[id]/edit" params={{ id: params.id }} class="button">
						Edit
					</Link>
					<button type="button" class="button danger" onClick={() => (confirming = true)}>
						Delete
					</button>
				</div>
			</article>
		} @else {
			<section class="missing">
				<h1>Note not found</h1>
				<Link href="/" class="button">
					Back to notes
				</Link>
			</section>
		}
		<modal.root open={confirming} onChange={(open: boolean) => (confirming = open)}>
			<modal.backdrop class="backdrop">
				<modal.content class="dialog">
					<modal.title class="dialog-title">Delete this note?</modal.title>
					<modal.description>“{title}” will be gone for good.</modal.description>
					<div class="dialog-actions">
						<modal.close class="button">Keep it</modal.close>
						<button
							type="button"
							class="button danger solid"
							onClick={async () => {
								saved = removeNote(saved, params.id);
								// storage() saves its cookie a task later, and the next page renders on the server from that cookie.
								await new Promise((done) => setTimeout(done));
								await navigate('/', { replace: true });
							}}
						>
							Delete note
						</button>
					</div>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</Shell>
}
