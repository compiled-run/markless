import { hovercard } from '../../index.ts';

// Two cards on one page, both served showing so the geometry is measurable. Every
// root confines the one anchor name to its own subtree, so neither card can land
// against the other's trigger; each mints its own id, so neither trigger can
// point at the other's card. The consumer links INSIDE each card are the hazard
// this scenario clears: they carry no scope class, so `a { anchor-name }` cannot
// reach them and mint a duplicate anchor.
export default function TwoCards() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="first-root" open side="top" delay={0}>
			<hovercard.trigger data-testid="first-trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="first-content">
				<a href="/users/jane" data-testid="first-card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
		<hovercard.root data-testid="second-root" open side="top" delay={0}>
			<hovercard.trigger data-testid="second-trigger" href="/users/amir">{'@amir'}</hovercard.trigger>
			<hovercard.content data-testid="second-content">
				<a href="/users/amir" data-testid="second-card-name">Amir Khan</a>
			</hovercard.content>
		</hovercard.root>
	</section>
}
