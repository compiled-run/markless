import { state } from '@markless/core';

/**
 * Can a graph write re-display an `<input>` a person has already typed into?
 *
 * Four shapes, each an independent cell so one test's typing cannot disturb
 * another's: a one-way input written from a button, the same input written from
 * a pointer drag on a sibling, a two-way input that also writes on its own
 * `onInput`, and a native `<input type="color">`.
 */
export default function ColorpickerGatesPage() @{
	let oneWay = state('#000000');
	let dragged = state('#000000');
	let dragging = state(false);
	let twoWay = state('#000000');
	let native = state('#000000');

	<section data-cpg-page>
		<input data-testid="one-way" value={oneWay} />
		<output data-testid="one-way-cell">{oneWay}</output>
		<button
			data-testid="one-way-write"
			onClick={() => {
				oneWay = '#00ff00';
			}}
		>
			write
		</button>

		<input data-testid="dragged" value={dragged} />
		<output data-testid="dragged-cell">{dragged}</output>
		<div
			data-testid="drag-area"
			onPointerdown={() => {
				dragging = true;
				dragged = '#112233';
			}}
			onPointermove={() => {
				if (dragging) dragged = '#445566';
			}}
			onPointerup={() => {
				dragging = false;
			}}
		>
			area
		</div>

		<input
			data-testid="two-way"
			value={twoWay}
			onInput={(event) => {
				twoWay = event.currentTarget.value;
			}}
		/>
		<output data-testid="two-way-cell">{twoWay}</output>
		<button
			data-testid="two-way-write"
			onClick={() => {
				twoWay = '#00ff00';
			}}
		>
			write
		</button>

		<input data-testid="native" type="color" value={native} />
		<output data-testid="native-cell">{native}</output>
		<button
			data-testid="native-write"
			onClick={() => {
				native = '#00ff00';
			}}
		>
			write
		</button>
	</section>
}
