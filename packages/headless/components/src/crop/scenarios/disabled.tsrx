import * as crop from '../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };

export default function Disabled() @{
	<main>
		<crop.root data-testid="root" name="crop" defaultValue={START} disabled>
			<crop.label data-testid="label">Crop</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
	</main>
}
