import { state } from '@markless/core';

export default function NestedSwitch() @{
	let visible = state(false);
	let mood = state('calm');

	<article>
		<em data-outer onClick={() => (visible = !visible)}>Show</em>
		<em data-inner onClick={() => (mood = mood === 'calm' ? 'loud' : 'calm')}>Mood</em>
		@if (visible) {
			@switch (mood) {
				@case 'loud': {
					<h3 data-shown>LOUD</h3>
				}
				@default: {
					<h3 data-shown>calm</h3>
				}
			}
		}
	</article>
}
