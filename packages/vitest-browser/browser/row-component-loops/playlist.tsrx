import { state } from '@markless/core';

export function Playlist({ list, onPlay }) @{
	let plays = state(0);

	<article class="playlist">
		<header>
			<{list.heading} class="title">{list.title}</{list.heading}>
			<output class="plays">{plays}</output>
		</header>
		<ol>
			@for (const track of list.tracks; key track.no) {
				<li class="track" data-no={track.no} onClick={() => plays = plays + 1}><em onClick={() => onPlay(String(track.no))}>{track.name}</em></li>
			}
		</ol>
	</article>
}
