import { crop } from '../../index.ts';


const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };

// The starter a consumer copies: a named area, the rectangle, its eight handles,
// and the field that submits.
export default function Basic() @{
	<main>
		<crop.root data-testid="root" name="crop" defaultValue={START}>
			<crop.label data-testid="label">Crop</crop.label>
			<crop.description data-testid="description">Drag the rectangle, or arrow it around.</crop.description>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-block-start" blockStart style={HANDLE} />
					<crop.thumb data-testid="handle-block-end" blockEnd style={HANDLE} />
					<crop.thumb data-testid="handle-inline-start" inlineStart style={HANDLE} />
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
					<crop.thumb data-testid="handle-top-start" blockStart inlineStart style={HANDLE} />
					<crop.thumb data-testid="handle-top-end" blockStart inlineEnd style={HANDLE} />
					<crop.thumb data-testid="handle-bottom-start" blockEnd inlineStart style={HANDLE} />
					<crop.thumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
	</main>
}
