import { hovercard } from '../../index.ts';

// The card offset away from the trigger by its own margin, which is the shape
// consumers actually write. The card is out of flow, so that margin is dead space
// inside neither part: the pointer crossing it leaves the root, and only
// `closeDelay` carries the card across. Opens with no wait so the rows are about
// the gap.
export default function Gapped() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root" delay={0}>
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content" style="margin-top: 24px">
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
	</section>
}
