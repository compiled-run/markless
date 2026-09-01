import { state } from '@markless/core';
import { crop } from '../../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };
const MOVED = { x: 41, y: 30, width: 200, height: 150 };

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. A rectangle only moves under a drag and the battery's
// gesture is a bare click, so the page holds the rectangle and a button writes
// one step of it back in — the controlled shape a consumer already writes.
export default function MultiEmbed() @{
	let held = state(START);

	<section data-testid="frame">
		<crop.root data-testid="root" name="crop" value={held}>
			<crop.label data-testid="label">Crop</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
		<button
			type="button"
			data-testid="step"
			onClick={() => {
				held = MOVED;
			}}
		>Right</button>
		<output data-testid="held" data-x={held.x} />
	</section>
}
