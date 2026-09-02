import { hovercard } from '../../index.ts';

// Two cards on one page, both closed and waiting no time at all, so a row about
// one card showing while the other is held open is about the family, not a timer.
export default function TwoCardsAtRest() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="first-root" delay={0}>
			<hovercard.trigger data-testid="first-trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="first-content">
				<a href="/users/jane" data-testid="first-card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
		<hovercard.root data-testid="second-root" delay={0}>
			<hovercard.trigger data-testid="second-trigger" href="/users/amir">{'@amir'}</hovercard.trigger>
			<hovercard.content data-testid="second-content">
				<a href="/users/amir" data-testid="second-card-name">Amir Khan</a>
			</hovercard.content>
		</hovercard.root>
	</section>
}
