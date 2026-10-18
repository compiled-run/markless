import { state } from '@markless/core';
import { Playlist } from './playlist.tsrx';

const rock = { slug: 'rock', title: 'Rock', heading: 'h4', tracks: [{ no: 7, name: 'Seven' }, { no: 8, name: 'Eight' }] };

export default function Station() @{
	let lists = state([{ slug: 'jazz', title: 'Jazz', heading: 'h3', tracks: [{ no: 1, name: 'One' }] }]);
	let last = state('none');

	<section>
		<span data-last>{last}</span>
		<button data-add-rock onClick={() => lists = [...lists, rock]}>Add rock</button>
		<button data-append onClick={() => lists = lists.map((list) => list.slug === 'rock' ? { ...list, tracks: [...list.tracks, { no: 9, name: 'Nine' }] } : list)}>Append</button>
		<button data-append-jazz onClick={() => lists = lists.map((list) => list.slug === 'jazz' ? { ...list, tracks: [...list.tracks, { no: 2, name: 'Two' }] } : list)}>Append jazz</button>
		<button data-drop-rock onClick={() => lists = lists.filter((list) => list.slug !== 'rock')}>Drop rock</button>
		<ul class="lists">
			<li class="static">Lists</li>
			@for (const list of lists; key list.slug) {
				<li data-row={list.slug}><Playlist list={list} onPlay={(no) => last = no} /></li>
			}
		</ul>
	</section>
}
