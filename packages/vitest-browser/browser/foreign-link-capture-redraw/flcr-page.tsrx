import { state } from '@markless/core';

export default function ForeignLinkCaptureRedrawPage() @{
	let likes = state(0);
	let opened = state(0);
	<section>
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
	</section>;
}
