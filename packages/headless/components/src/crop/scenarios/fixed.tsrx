import * as crop from '../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px; overflow: hidden';
const CONTENT =
	'position: absolute; inset: 0; background: linear-gradient(90deg, #333, #ccc); transform: translate(var(--pan-x, 0px), var(--pan-y, 0px))';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 0, y: 0, width: 160, height: 120 };

// The other interaction model: the rectangle stays put and the content pans under
// it. `--pan-x` and `--pan-y` come off the area; the consumer applies them.
export default function Fixed() @{
	<main>
		<crop.root data-testid="root" name="crop" defaultValue={START} fixed>
			<crop.label data-testid="label">Viewfinder</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<div data-testid="content" style={CONTENT} />
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
	</main>
}
