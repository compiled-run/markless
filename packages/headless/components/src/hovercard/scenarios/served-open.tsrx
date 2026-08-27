import { hovercard } from '../../index.ts';

// The card is authored after the trigger, so a dead anchor leaves it in static
// flow BELOW the trigger. The suite's own consumer rule puts every card ABOVE,
// and only a placement that differs from static flow tells a resolved anchor from
// a silent miss.
export default function ServedOpen() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root" open>
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
	</section>
}
