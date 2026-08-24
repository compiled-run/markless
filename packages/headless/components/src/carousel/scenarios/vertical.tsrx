import * as carousel from '../index.ts';

// Slides stacked down the page instead of across it.
export default function Vertical() @{
	<section>
		<carousel.root value="top" orientation="vertical" data-testid="root">
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="top" data-testid="top-item" data-slide>Top</carousel.item>
				<carousel.item value="middle" data-testid="middle-item" data-slide>Middle</carousel.item>
				<carousel.item value="bottom" data-testid="bottom-item" data-slide>Bottom</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
	</section>
}
