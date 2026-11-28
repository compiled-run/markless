import { state } from '@markless/core';
import { capture, press, seen } from '../src/gesture.ts';

export default function Page() @{
	let taps = state(0);
	let tapSeen = state('');
	let value = state(0);
	let fromY = state(0);
	let from = state(0);
	let dragging = state(false);
	let moves = state(0);
	let dragLog = state('');
	let buttonKeys = state('');
	let groupKeys = state('');
	let sliderKeys = state('');
	let sliderValue = state(0);

	<main data-name="main">
		<button type="button" data-name="tap" data-tap data-held="yes" onClick={(event) => {
			tapSeen = seen(event);
			press(event.currentTarget as Element, taps, (next) => (taps = next));
		}}>{'Tap'}</button>
		<output data-taps>{taps}</output>
		<output data-tap-seen>{tapSeen}</output>

		<svg width="300" height="300" viewBox="0 0 300 300" data-name="svg">
			<rect data-name="field" x="0" y="0" width="300" height="300" fill="#eee" />
			<g data-knob data-name="knob" tabindex="0" role="slider" aria-valuenow={value} data-dragging={dragging ? 'yes' : 'no'}
				onPointerDown={(event) => {
					capture(event);
					dragging = true;
					fromY = event.clientY;
					from = value;
					dragLog = seen(event);
				}}
				onPointerMove={(event) => {
					if (!dragging) return;
					moves = moves + 1;
					value = from + Math.round((fromY - event.clientY) / 10);
				}}
				onPointerUp={(event) => {
					dragging = false;
					dragLog = dragLog + ' | ' + seen(event) + ' captured=' + (event.currentTarget as Element).hasPointerCapture(event.pointerId);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						groupKeys = groupKeys + seen(event) + ';';
					}
				}}
			>
				<rect data-name="knob-face" x="130" y="230" width="40" height="40" fill="#888" />
			</g>
		</svg>
		<output data-value>{value}</output>
		<output data-moves>{moves}</output>
		<output data-drag-log>{dragLog}</output>
		<output data-group-keys>{groupKeys}</output>

		<button type="button" data-name="key-button" data-key-button onKeyDown={(event) => {
			buttonKeys = buttonKeys + seen(event) + ';';
		}}>{'Keys'}</button>
		<output data-button-keys>{buttonKeys}</output>

		<div data-name="slider" data-slider tabindex="0" role="slider" aria-valuenow={sliderValue} onKeyDown={(event) => {
			if (event.key === 'ArrowRight' || event.key === ' ') {
				event.preventDefault();
				sliderValue = sliderValue + 1;
				sliderKeys = sliderKeys + seen(event) + ';';
			}
		}}>{'Slider'}</div>
		<output data-slider-keys>{sliderKeys}</output>
		<div class="pad"></div>
	</main>
}
