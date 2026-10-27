import { state } from '@markless/core';
import { art } from './crr-art.ts';

export default function StrokeFigure() @{
	let pressed = state(-1);
	<figure>
		<svg viewBox="0 0 10 10" aria-hidden="true">
			@for (const hand of art.handlers; key hand.key) {
				<path data-stroke={hand.key} class={pressed === hand.key ? 'swipe pressed' : 'swipe'} d={hand.d} />
			}
		</svg>
		<button type="button" data-hit={0} onClick={() => (pressed = 0)}>a</button>
		<button type="button" data-hit={1} onClick={() => (pressed = 1)}>b</button>
	</figure>
}
