import { storage } from '@markless/core';
import { Link } from '@markless/router';
import { readNotes } from '../lib/notes.ts';

export default function AllNotes() @{
	let saved = storage('s51-notes', '[]');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.heading {
				margin: 0 0 16px;
				font-size: 26px;
				font-weight: 700;
			}
			.rows {
				margin: 0 0 16px;
				padding: 0;
				list-style: none;
			}
			.row {
				margin: 8px 0 0;
				padding: 12px 16px;
				border: 1px solid #e4ddcf;
				border-radius: 12px;
				background: #ffffff;
			}
			.title {
				display: block;
				font-weight: 700;
			}
			.new {
				display: block;
				padding: 12px 16px;
				border-radius: 12px;
				background: #2f6f5e;
				color: #ffffff;
				text-decoration: none;
			}
		</style>
		<h1 class="heading">All notes</h1>
		<ul class="rows">
			@for (const note of readNotes(saved); key note.id) {
				<li class="row">
					<span class="title">{note.title}</span>
				</li>
			}
		</ul>
		<Link href="/new" class="new">Write a note</Link>
	</main>
}
