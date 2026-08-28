import { state } from '@markless/core';
import { ink } from '../../index.ts';

const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

// The drawing's strokes live in the page, not in the family: nothing appears
// until `onChange` hands them back and they are written in again.
//
// This is also where undo and clear buttons come from today. A button calling
// `ink.state().undo()` is a shared() method called from another module, which the
// compiler refuses — `scenarios/method.tsrx` pins that refusal. A controlled
// consumer needs no method: the buttons below write their own array.
export default function Controlled() @{
	let held = state([] as readonly string[]);
	let calls = state(0);
	let drawn = state('');

	<main>
		<ink.root
			data-testid="root"
			name="drawing"
			paths={held}
			onChange={(next) => {
				held = next;
				calls = calls + 1;
			}}
			onDraw={(current) => {
				drawn = current;
			}}
		>
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
		<button
			type="button"
			data-testid="undo"
			onClick={() => {
				held = held.slice(0, held.length - 1);
			}}
		>Undo</button>
		<button
			type="button"
			data-testid="clear"
			onClick={() => {
				held = [];
			}}
		>Clear</button>
		<output data-testid="count">{held.length}</output>
		<output data-testid="calls">{calls}</output>
		<output data-testid="drawn">{drawn}</output>
	</main>
}
