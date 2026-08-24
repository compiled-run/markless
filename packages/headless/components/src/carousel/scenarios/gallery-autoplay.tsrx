import { carousel } from '../../index.ts';

// The realistic one. The APG says the rotation control comes first in the tab
// sequence inside the carousel, so it is written first; and the interval is
// short enough that a test can watch a slide change.
export default function GalleryAutoplay() @{
	<section>
		<carousel.root value="paris" autoplayInterval={80} data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.playtrigger data-testid="playtrigger">Play</carousel.playtrigger>
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="paris" data-testid="paris-item" data-slide>Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item" data-slide>Oslo</carousel.item>
				<carousel.item value="lima" data-testid="lima-item" data-slide>Lima</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
	</section>
}
