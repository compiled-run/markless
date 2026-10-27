import { state } from '@markless/core';
import { art } from './crr-art.ts';

const MARKS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
const GROUPS = [
	{ key: 'g1', marks: [{ key: 'x' }, { key: 'y' }] },
	{ key: 'g2', marks: [{ key: 'z' }] },
];

export default function ConstantRows() @{
	let pressed = state('');
	let drawn = state(-1);

	<main>
		<ul>
			@for (const mark of MARKS; key mark.key) {
				<li data-mark={mark.key} class={pressed === mark.key ? 'on' : 'off'}>
					<button type="button" data-press={mark.key} onClick={() => (pressed = mark.key)}>{mark.key}</button>
					<span data-says={mark.key}>{pressed === mark.key ? 'yes' : 'no'}</span>
				</li>
			}
		</ul>
		@for (const group of GROUPS; key group.key) {
			<section data-group={group.key}>
				@for (const mark of group.marks; key mark.key) {
					<i data-nested={mark.key} class={pressed === mark.key ? 'on' : 'off'} onClick={() => (pressed = mark.key)}>{mark.key}</i>
				}
			</section>
		}
		<svg viewBox="0 0 10 10" aria-hidden="true">
			<rect width="10" height="10" />
			@for (const mark of art.handlers; key mark.key) {
				<path data-stroke={mark.key} class={drawn === mark.key ? 'swipe pressed' : 'swipe'} d={mark.d} style={'stroke-width:' + mark.width + 'px;--l:' + mark.length} />
			}
			<circle r="1" />
		</svg>
		<button type="button" data-draw onClick={() => (drawn = 1)}>draw</button>
	</main>
}
