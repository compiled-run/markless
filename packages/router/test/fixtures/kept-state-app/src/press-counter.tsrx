import { state } from '@markless/core';

export default function PressCounter() @{
	let presses = state(0);

	<section class="press-counter" data-counter>
		<p class="press-note">{'This counter sits under the page content, so the page before it moves its place in the document.'}</p>
		<p class="press-note">{'Every page of the documentation renders it, and an in-place navigation keeps the count the reader reached.'}</p>
		<p class="press-note">{'A part this small would not be worth keeping, so these notes make it long enough: a kept part saves its own markup.'}</p>
		<p class="press-note">{'The count it shows is its own state, and the button that raises it is its own handler, both of which survive the swap.'}</p>
		<button type="button" data-press onClick={() => presses++}>{`pressed ${presses}`}</button>
	</section>
}
