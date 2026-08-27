import { tooltip } from '../../index.ts';

// The tip authored BEFORE the trigger, which the CSS anchor spec's
// "laid out strictly before" wording reads as a hazard. Measured here: it is not
// one while the trigger is in normal flow. Kept as the witness for that, not as
// a starter to copy - the family's own starter puts the tip last.
//
// Its own testid, because the row that measures it needs a consumer rule putting
// the tip BELOW: static flow would put a tip authored first above, so only the
// other placement can tell a resolved anchor from a silent miss.
export default function Reversed() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" open>
			<tooltip.content data-testid="reversed-content">Save this draft</tooltip.content>
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
		</tooltip.root>
	</section>
}
