import { state } from '@markless/core';
import type { PadPoint } from '../index.ts';
import * as pad from '../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const START = [{ id: 'offset', x: 0.25, y: 0.75 }];

// The points live in the page, not in the family: nothing moves until `onChange`
// or `onDrag` hands them back and they are written in again.
export default function Controlled() @{
	let held = state(START as readonly PadPoint[]);
	let calls = state(0);
	let drags = state(0);

	<main>
		<pad.root
			data-testid="root"
			value={held}
			onChange={(next) => {
				held = next;
				calls = calls + 1;
			}}
			onDrag={(next) => {
				held = next;
				drags = drags + 1;
			}}
		>
			<pad.label data-testid="label">Shadow offset</pad.label>
			<pad.area data-testid="area" style={FIELD}>
				<pad.thumb data-testid="thumb" />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
		</pad.root>
		<button
			type="button"
			data-testid="reset"
			onClick={() => {
				held = START;
			}}
		>Reset</button>
		<output data-testid="calls">{calls}</output>
		<output data-testid="drags">{drags}</output>
	</main>
}
