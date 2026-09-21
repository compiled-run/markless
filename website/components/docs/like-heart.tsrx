import MugArt from '../mascot/mug-art.tsrx';
import { state, storage } from '@markless/core';

export default function LikeHeart() @{
	let greetings = state(0);
	let face = storage('mascot-expression', 'neutral');
	let glaze = storage('mascot-glaze', 'cream');
	let pour = storage('mascot-pour', 'rosetta');
	let coaster = storage('mascot-coaster', 'off');
	let companion = storage('mascot-companion', 'off');

	<div class="like-heart">
		<button
			class="like-heart-button"
			type="button"
			aria-label="Say hello to the mug"
			title="Say hello to the mug"
			data-reaction={greetings === 0 ? 'rest' : greetings % 2 === 0 ? 'even' : 'odd'}
			onClick={() => {
				greetings++;
			}}
		>
			<MugArt
				mood="idle"
				paused="false"
				variant="toc"
				face={face}
				glaze={glaze}
				pour={pour}
				coaster={coaster}
				companion={companion}
				interacted={greetings > 0 ? 'true' : 'false'}
				reaction={greetings === 0 ? 'rest' : greetings % 2 === 0 ? 'even' : 'odd'}
			/>
		</button>
		<style>
			.like-heart { display:flex; justify-content:center; margin-top:var(--space-l); }
			.like-heart-button { --spring:linear(0, 0.027 1.1%, 0.103 2.3%, 0.583 7.5%, 0.792 10.4%, 0.932 13.6%, 0.977 15.4%, 1.006 17.4%, 1.02 19.4%, 1.024 21.7%, 1 38.4%, 1); display:grid; justify-items:center; width:11rem; padding:0; border:0; background:none; color:var(--ink); font:inherit; cursor:pointer; border-radius:12px; }
			.like-heart-button:focus-visible { outline:2px solid var(--ink); outline-offset:3px; }@media(min-width:70.01rem) {
				.like-heart { position:fixed; right:var(--space-s-l); width:11rem; margin:0; top: min(calc(var(--header-height) + var(--space-s) + 21rem), calc(100vh - 12rem)); }
				@supports(position-anchor:--on-this-page) {
					.like-heart { position-anchor:--on-this-page; top:calc(anchor(bottom, var(--header-height)) + var(--space-s)); left:anchor(left, auto); }
				}
			}

</style>
	</div>;
}
