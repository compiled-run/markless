import { ink, textbox } from '../../index.ts';

const SURFACE = 'display: block; width: 320px; height: 140px; color: #111';

// A signature pad is `ink` with a guide line and a required field. The typed name
// beside it is not decoration: a drawn signature carries no text, and WCAG 1.1.1
// makes an equivalent the consumer's obligation, not the family's.
export default function Signature() @{
	<main>
		<form data-testid="form">
			<ink.root data-testid="root" name="signature" required>
				<ink.label data-testid="label">Signature</ink.label>
				<ink.description data-testid="description">Sign on the line.</ink.description>
				<ink.area data-testid="area" style={SURFACE}>
					<ink.indicator data-testid="indicator" />
				</ink.area>
				<ink.field data-testid="field" />
			</ink.root>
			<textbox.root name="signed-name" required data-testid="name-root">
				<textbox.label data-testid="name-label">Type your name</textbox.label>
				<textbox.input data-testid="name-input" />
			</textbox.root>
			<button type="submit" data-testid="submit">Sign</button>
		</form>
	</main>
}
