import { state } from '@markless/core';

// Members a script reads live off the element: none of them has an attribute that keeps up.
export default function MediaPage() @{
	let loud = state(false);
	let level = state(1);
	let scrolled = state(0);
	let draft = state('first');

	<main>
		<video id="clip" muted={!loud} volume={level} />
		<div id="pane" style="height: 40px; overflow: auto" scrollTop={scrolled}>
			<div style="height: 400px">tall</div>
		</div>
		<input id="draft" defaultValue={draft} />
		<button
			id="next"
			onClick={() => {
				loud = !loud;
				level = level === 1 ? 0.25 : 1;
				scrolled = scrolled === 0 ? 120 : 0;
				draft = draft === 'first' ? 'second' : 'first';
			}}
		>
			next
		</button>
	</main>
}
