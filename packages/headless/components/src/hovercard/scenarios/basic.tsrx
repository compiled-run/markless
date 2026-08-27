import { hovercard } from '../../index.ts';

export default function Basic() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root">
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
				<p>Builds compilers.</p>
			</hovercard.content>
		</hovercard.root>
		<a href="/after" data-testid="after">After</a>
	</section>
}
