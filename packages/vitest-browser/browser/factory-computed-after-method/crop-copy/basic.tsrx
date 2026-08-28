import {
	CropArea,
	CropDescription,
	CropField,
	CropLabel,
	CropRoot,
	CropSelection,
	CropThumb,
} from './crop.tsrx';

const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };

// The starter a consumer copies: a named area, the rectangle, its eight handles,
// and the field that submits.
export default function Basic() @{
	<main>
		<CropRoot data-testid="root" name="crop" defaultValue={START}>
			<CropLabel data-testid="label">Crop</CropLabel>
			<CropDescription data-testid="description">Drag the rectangle, or arrow it around.</CropDescription>
			<CropArea data-testid="area" style={AREA}>
				<CropSelection data-testid="selection">
					<CropThumb data-testid="handle-block-start" blockStart style={HANDLE} />
					<CropThumb data-testid="handle-block-end" blockEnd style={HANDLE} />
					<CropThumb data-testid="handle-inline-start" inlineStart style={HANDLE} />
					<CropThumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
					<CropThumb data-testid="handle-top-start" blockStart inlineStart style={HANDLE} />
					<CropThumb data-testid="handle-top-end" blockStart inlineEnd style={HANDLE} />
					<CropThumb data-testid="handle-bottom-start" blockEnd inlineStart style={HANDLE} />
					<CropThumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</CropSelection>
			</CropArea>
			<CropField data-testid="field" />
		</CropRoot>
	</main>
}
