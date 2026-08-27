import * as pad from '../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const CONTROLS = [
	{ id: 'p1', x: 0.25, y: 0.1 },
	{ id: 'p2', x: 0.75, y: 0.9 },
];

// What a form actually sends: one `pad.field` per handle, each under its own
// name, each carrying that handle's two numbers as `x,y`.
export default function Form() @{
	<form data-testid="form">
		<pad.root data-testid="root" defaultValue={CONTROLS}>
			<pad.label data-testid="label">Easing curve</pad.label>
			<pad.description data-testid="description">Move each control point.</pad.description>
			<pad.area data-testid="area" style={FIELD}>
				<pad.thumb value={CONTROLS[0]} data-testid="thumb" />
				<pad.thumb value={CONTROLS[1]} data-testid="thumb" />
			</pad.area>
			<pad.error data-testid="error">Move both points before sending.</pad.error>
			<pad.field value={CONTROLS[0]} data-testid="field" name="p1" />
			<pad.field value={CONTROLS[1]} data-testid="field" name="p2" />
		</pad.root>
		<button type="submit" data-testid="submit">Send</button>
	</form>
}
