import { hovercard } from '../../index.ts';

// Several focusables in the card, so Tab has somewhere to land and somewhere to
// leave from. `delay={0}` keeps the tab-order rows about the tab order.
export default function Rich() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root" delay={0} closeDelay={0}>
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<img src="/users/jane/avatar.png" alt="" />
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
				<p>Builds compilers.</p>
				<a href="/users/jane/followers" data-testid="card-followers">312 followers</a>
				<button type="button" data-testid="card-follow">Follow</button>
			</hovercard.content>
		</hovercard.root>
		<a href="/after" data-testid="after">After</a>
	</section>
}
