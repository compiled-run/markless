import * as drawer from '../index.ts';

// With neither a title nor a description, the naming references are omitted
// rather than left pointing at ids no part put on the page.
export default function Unnamed() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Open</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<drawer.close data-testid="close">Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
