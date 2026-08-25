import { dateinput } from '../../index.ts';

// A date that failed validation. Mounting the error part at all is what marks the
// boxes invalid, and it works whether the message is written after the boxes or
// before them, because seeding completes before any part renders.
export default function Invalid() @{
	<section>
		<dateinput.root data-testid="after-root">
			<dateinput.label data-testid="after-label">Start date</dateinput.label>
			<dateinput.monthinput data-testid="after-monthinput" />
			<dateinput.dayinput data-testid="after-dayinput" />
			<dateinput.yearinput data-testid="after-yearinput" />
			<dateinput.error data-testid="after-error">Enter a whole date</dateinput.error>
		</dateinput.root>
		<dateinput.root data-testid="before-root">
			<dateinput.error data-testid="before-error">Enter a whole date</dateinput.error>
			<dateinput.label data-testid="before-label">Start date</dateinput.label>
			<dateinput.monthinput data-testid="before-monthinput" />
			<dateinput.dayinput data-testid="before-dayinput" />
			<dateinput.yearinput data-testid="before-yearinput" />
		</dateinput.root>
	</section>
}
