import { state } from '@markless/core';

// The branch makes the inline listener forward presses it matched no record for, the shape that threw.
export default function ForeignLinksCapturePage() @{
	let likes = state(0);
	let opened = state(0);
	<main>
		<button type="button" data-like onClick={() => (likes = likes + 1)}>
			{likes}
		</button>
		<article data-panel>
			<div data-favourites onClick={() => (opened = opened + 1)}></div>
		</article>
		<output data-opened>{opened}</output>
		@if (likes > 9) {
			<p>Popular</p>;
		}
	</main>;
}
