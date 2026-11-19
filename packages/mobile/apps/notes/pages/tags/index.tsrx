import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';
import { parseNotes, TAGS } from '../../lib/notes.ts';

export default function Tags() @{
	let saved = storage('notes', '[]');
	const counts = computed(() => {
		const notes = parseNotes(saved);
		return TAGS.map((tag) => ({ tag, count: notes.filter((note) => note.tag === tag).length }));
	});

	<Shell title="Tags">
		<style>
			.tags {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 12px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			@media (min-width: 700px) {
				.tags {
					grid-template-columns: repeat(4, 1fr);
				}
			}
			.tag {
				display: grid;
				gap: 4px;
				padding: 18px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				text-decoration: none;
			}
			.tag:active {
				transform: scale(0.97);
			}
			.tag span {
				color: var(--muted);
				font-size: 14px;
			}
		</style>
		<h1>Tags</h1>
		<ul class="tags">
			@for (const entry of counts; key entry.tag) {
				<li>
					<Link href="/tags/[tag]" params={{ tag: entry.tag }} class="tag">
						<strong>{entry.tag}</strong>
						<span>{entry.count === 1 ? '1 note' : `${entry.count} notes`}</span>
					</Link>
				</li>
			}
		</ul>
	</Shell>
}
