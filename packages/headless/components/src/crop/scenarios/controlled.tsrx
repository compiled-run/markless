import { state } from '@markless/core';
import * as crop from '../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };

// The rectangle lives in the page, not in the family: nothing moves until
// `onChange` hands it back and it is written in again.
export default function Controlled() @{
	let held = state(START);
	let calls = state(0);
	let dragged = state(0);

	<main>
		<crop.root
			data-testid="root"
			name="crop"
			value={held}
			onChange={(next) => {
				held = next;
				calls = calls + 1;
			}}
			onDrag={() => {
				dragged = dragged + 1;
			}}
		>
			<crop.label data-testid="label">Crop</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
					<crop.thumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
		<button
			type="button"
			data-testid="reset"
			onClick={() => {
				held = START;
			}}
		>Reset</button>
		<output data-testid="calls">{calls}</output>
		<output data-testid="dragged">{dragged}</output>
	</main>
}
