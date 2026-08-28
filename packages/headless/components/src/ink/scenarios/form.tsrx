import { ink } from '../../index.ts';


const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';
const KEPT = ['M 10 10 h 40 v 6 h -40 z', 'M 60 20 h 30 v 4 h -30 z'];

// What a form actually sends: `ink.field` carries every stroke's path data joined
// into one `d` string. Mounting `ink.error` is what marks the drawing invalid.
export default function Form() @{
	<form data-testid="form">
		<ink.root data-testid="root" name="drawing" defaultPaths={KEPT} required>
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.description data-testid="description">Draw something.</ink.description>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.error data-testid="error">Draw something before sending.</ink.error>
			<ink.field data-testid="field" />
		</ink.root>
		<button type="submit" data-testid="submit">Send</button>
	</form>
}
