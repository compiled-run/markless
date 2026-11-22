import { state } from '@markless/core';

type Note = { readonly id: string; readonly title: string; readonly pinned: boolean };

export default function Notes() @{
	let notes = state<ReadonlyArray<Note>>([
		{ id: 'a', title: 'Groceries', pinned: false },
		{ id: 'b', title: 'Call the plumber about the kitchen tap before Friday', pinned: true },
	]);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.notes {
				margin: 16px 0 0;
				padding: 0;
				list-style: none;
			}
			.note {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-top: 8px;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
			}
			.note.pinned {
				border-color: #e9c46a;
				background: #fff8e1;
			}
			.title {
				flex: 1;
				font-size: 17px;
				color: #212529;
			}
			.empty {
				margin-top: 16px;
				color: #6c757d;
				font-size: 15px;
			}
			.action {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.footer {
				margin-top: 24px;
				padding-top: 12px;
				border-top: 1px solid #adb5bd;
				color: #495057;
				font-size: 15px;
			}
		</style>
		<title>Notes</title>
		<h1 class="heading">Notes</h1>
		@if (notes.length === 0) {
			<p class="empty">No notes yet</p>
		} @else {
			<ul class="notes">
				@for (const note of notes; key note.id) {
					<li class={note.pinned ? 'note pinned' : 'note'}>
						<span class="title">{note.title}</span>
					</li>
				}
			</ul>
		}
		<button
			class="action"
			onClick={() =>
				(notes = [...notes, { id: `n${notes.length}`, title: 'Water the plants', pinned: notes.length % 2 === 1 }])
			}
		>
			Add note
		</button>
		<button
			class="action"
			onClick={() =>
				(notes = [
					...notes,
					...Array.from({ length: 10 }, (_, at) => ({ id: `t${notes.length + at}`, title: `Note ${notes.length + at + 1}`, pinned: false })),
				])
			}
		>
			Add ten notes
		</button>
		<button class="action" onClick={() => (notes = [])}>
			Clear notes
		</button>
		<footer class="footer">End of list</footer>
	</main>
}
