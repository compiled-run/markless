import { colorpicker } from '../../index.ts';

const RAIL = 'position: relative; width: 200px; height: 20px; touch-action: none';

// `colorpicker.field` is what a form submits: a plain text input carrying the
// same hex the callbacks report.
export default function Form() @{
	<form data-testid="form">
		<colorpicker.root value="#3399ff" name="brand" required invalid data-testid="root">
			<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
			<colorpicker.content data-testid="content">
				<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
					<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
				</colorpicker.track>
			</colorpicker.content>
			<colorpicker.error data-testid="error">Pick a colour with enough contrast.</colorpicker.error>
			<colorpicker.field data-testid="field" />
		</colorpicker.root>
	</form>
}
