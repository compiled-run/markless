import * as crop from '../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 10, y: 20, width: 120, height: 90 };

// What a form actually sends: `crop.field` carries `x,y,width,height` as text.
// Mounting `crop.error` is what marks the crop invalid.
export default function Form() @{
	<form data-testid="form">
		<crop.root data-testid="root" name="crop" defaultValue={START} required>
			<crop.label data-testid="label">Crop</crop.label>
			<crop.description data-testid="description">Pick the part to keep.</crop.description>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.error data-testid="error">Pick a crop before sending.</crop.error>
			<crop.field data-testid="field" />
		</crop.root>
		<button type="submit" data-testid="submit">Send</button>
	</form>
}
