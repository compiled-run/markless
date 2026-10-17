import { state } from '@markless/core';

export default function ForeignLinkRedrawPage() @{
	let likes = state(0);
	let opened = state(0);
	<section>
		<button type="button" data-like onClick={() => (likes = likes + 1)}>{likes}</button>
		<div data-favourites onClick={() => (opened = opened + 1)}></div>
		<output data-opened>{opened}</output>
	</section>
}
