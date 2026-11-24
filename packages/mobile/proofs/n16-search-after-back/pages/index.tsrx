import { computed, state, storage } from '@markless/core';
import { Link } from '@markless/router';
import Nav from '../lib/Nav.tsrx';

export default function AllNotes() @{
	let saved = storage('titles', '');
	let query = state('');
	const titles = computed(() => (saved === '' ? [] : saved.split('|')));
	const shown = computed(() => titles.filter((title) => title.includes(query)));
	<Nav>
		<title>All notes</title>
		@if (titles.length === 0) {
			<>
				<h1>No notes yet</h1>
				<Link href="/new">Write your first note</Link>
			</>
		} @else {
			<>
				<h1>All notes</h1>
				<input
					type="search"
					aria-label="Search notes"
					placeholder="Search notes"
					value={query}
					onInput={(event) => (query = event.currentTarget.value)}
				/>
				<ul>
					@for (const title of shown; key title) {
						<li>
							<Link href="/notes/[id]" params={{ id: title }}>
								{title}
							</Link>
						</li>
					}
				</ul>
				<p hidden={shown.length > 0}>No notes match “{query}”</p>
			</>
		}
	</Nav>
}
