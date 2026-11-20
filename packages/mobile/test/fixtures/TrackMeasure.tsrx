import { element, state } from '@markless/core';

function isRightToLeft(track: HTMLElement): boolean {
	return window.getComputedStyle(track).direction === 'rtl';
}

function percentAt(track: HTMLElement | undefined, along: number): number {
	if (!track) return -1;
	track.setPointerCapture(1);
	const box = track.getBoundingClientRect();
	const fraction = Math.min(1, Math.max(0, (along - box.left) / box.width));
	return Math.round((isRightToLeft(track) ? 1 - fraction : fraction) * 100);
}

function size(item: HTMLElement | undefined): string {
	if (!item) return 'none';
	const box = item.getBoundingClientRect();
	return `${box.width}x${box.height} at ${box.x},${box.y}; ends ${box.right},${box.bottom}`;
}

export default function TrackMeasure() @{
	const track = element<HTMLDivElement>();
	const flipped = element<HTMLDivElement>();
	let value = state(0);
	let report = state('');
	<main>
		<div el={track} class="track"></div>
		<div el={flipped} dir="rtl" class="track"></div>
		<button onClick={() => (value = percentAt(track, 100))}>Quarter</button>
		<button onClick={() => (value = percentAt(flipped, 100))}>Quarter flipped</button>
		<button onClick={() => (report = size(track))}>Size</button>
		<p>{value}</p>
		<p>{report}</p>
	</main>
}
