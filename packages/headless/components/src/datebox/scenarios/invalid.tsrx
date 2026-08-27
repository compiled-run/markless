import { datebox } from '../../index.ts';

// A date that failed validation. Mounting the error part at all is what marks the
// boxes invalid, and it works whether the message is written after the boxes or
// before them, because seeding completes before any part renders.
export default function Invalid() @{
	<section>
		<datebox.root data-testid="after-root">
			<datebox.label data-testid="after-label">Start date</datebox.label>
			<datebox.monthinput data-testid="after-monthinput" />
			<datebox.dayinput data-testid="after-dayinput" />
			<datebox.yearinput data-testid="after-yearinput" />
			<datebox.error data-testid="after-error">Enter a whole date</datebox.error>
		</datebox.root>
		<datebox.root data-testid="before-root">
			<datebox.error data-testid="before-error">Enter a whole date</datebox.error>
			<datebox.label data-testid="before-label">Start date</datebox.label>
			<datebox.monthinput data-testid="before-monthinput" />
			<datebox.dayinput data-testid="before-dayinput" />
			<datebox.yearinput data-testid="before-yearinput" />
		</datebox.root>
	</section>
}
