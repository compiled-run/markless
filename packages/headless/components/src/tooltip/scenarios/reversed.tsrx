import { tooltip } from '../../index.ts';

// The tip authored BEFORE the trigger, which the CSS anchor spec's
// "laid out strictly before" wording reads as a hazard. Measured here: it is not
// one while the trigger is in normal flow. Kept as the witness for that, not as
// a starter to copy - the family's own starter puts the tip last.
export default function Reversed() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" open side="bottom">
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
		</tooltip.root>
	</section>
}
