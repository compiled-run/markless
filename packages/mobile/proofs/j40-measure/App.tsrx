import { element, state } from '@markless/core';

function isRightToLeft(track: HTMLElement): boolean {
	return window.getComputedStyle(track).direction === 'rtl';
}

function quarter(track: HTMLElement | undefined): string {
	if (!track) return 'none';
	const box = track.getBoundingClientRect();
	const fraction = (box.left + box.width / 4 - box.left) / box.width;
	return String(Math.round((isRightToLeft(track) ? 1 - fraction : fraction) * 100));
}

function stacked(first: HTMLElement | undefined, second: HTMLElement | undefined): string {
	if (!first || !second) return 'none';
	const top = first.getBoundingClientRect();
	const below = second.getBoundingClientRect();
	const sized = top.width > 0 && top.height > 0 && below.width > 0 && below.height > 0;
	return sized && below.top >= top.bottom && below.left === top.left ? 'yes' : 'no';
}

export default function App() @{
	const track = element<HTMLDivElement>();
	const rail = element<HTMLDivElement>();
	let at = state('not yet');
	let below = state('not yet');
	let direction = state('not yet');
	<main>
		<h1>Boxes</h1>
		<div el={track}>Track</div>
		<div el={rail}>Rail</div>
		<p>Quarter {at}</p>
		<p>Stacked {below}</p>
		<p>Direction {direction}</p>
		<button
			onClick={() => {
				at = quarter(track);
				below = stacked(track, rail);
				direction = track ? window.getComputedStyle(track).direction : 'none';
			}}
		>
			Measure
		</button>
	</main>
}
