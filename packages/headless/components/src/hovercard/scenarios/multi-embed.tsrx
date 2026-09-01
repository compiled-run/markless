import { hovercard } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths — which is the point of the shape. `delay={0}` makes the card
// answer the battery's single crossing rather than a rest timer, and the
// trigger points at a fragment so the click that raises it cannot navigate the
// page out from under the run.
export default function MultiEmbed() @{
	<section data-testid="frame" style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root data-testid="root" delay={0}>
			<hovercard.trigger data-testid="trigger" href="#jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<a href="#jane-profile" data-testid="card-name">Jane Doe</a>
				<p>Builds compilers.</p>
			</hovercard.content>
		</hovercard.root>
	</section>
}
