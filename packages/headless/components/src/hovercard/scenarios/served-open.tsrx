import { hovercard } from '../../index.ts';

// `side="top"` on purpose: the card is authored after the trigger, so a dead
// anchor leaves it in static flow BELOW the trigger. Only a side whose placement
// differs from static flow can tell a resolved anchor from a silent miss.
export default function ServedOpen() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root" open side="top">
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
	</section>
}
