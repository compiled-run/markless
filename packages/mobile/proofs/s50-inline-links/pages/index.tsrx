import { Link } from '@markless/router';

type Note = { readonly id: string; readonly title: string };

const notes: ReadonlyArray<Note> = [
	{ id: 'groceries', title: 'Groceries' },
	{ id: 'garden', title: 'Garden' },
];

export default function Home() @{
	<main class="home">
		<style>
			.home {
				padding: 24px;
				background: #f4f1ea;
				color: #1d1b16;
				font-size: 18px;
			}
			.heading {
				margin: 0;
				font-size: 28px;
				font-weight: 700;
			}
			.rows {
				margin: 16px 0;
				padding: 0;
				list-style: none;
			}
			.row {
				margin: 8px 0 0;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
			}
			.lead {
				margin: 8px 0;
			}
		</style>
		<h1 class="heading">Notes</h1>
		<Link href="/notes/[id]" params={{ id: 'about' }}>About these notes</Link>
		<p class="lead">Pick one below.</p>
		<ul class="rows">
			@for (const note of notes; key note.id) {
				<li class="row">
					<Link href="/notes/[id]" params={{ id: note.id }}>{note.title}</Link>
				</li>
			}
		</ul>
	</main>
}
