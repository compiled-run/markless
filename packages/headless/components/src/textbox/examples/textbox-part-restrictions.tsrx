import { textbox } from '../../index.ts';

// Restrictions set on the control rather than the root. One scenario in two
// directions: a part may make a field stricter than the root was told about,
// and it may never remove a restriction the root set.
export default function PartRestrictions() @{
	<section>
		<textbox.root data-testid="stricter-root">
			<textbox.label data-testid="stricter-label">Username</textbox.label>
			<textbox.input required readonly data-testid="stricter-input" />
		</textbox.root>
		<textbox.root required data-testid="looser-root">
			<textbox.label data-testid="looser-label">Username</textbox.label>
			<textbox.input required={false} data-testid="looser-input" />
		</textbox.root>
	</section>
}
