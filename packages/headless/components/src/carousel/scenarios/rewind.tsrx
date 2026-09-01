import { carousel } from '../../index.ts';

// The same three slides as the starter, but the ends come round instead of
// stopping: `rewind` is what makes the far end reachable from the near one.
export default function Rewind() @{
	<section>
		<carousel.root value="paris" rewind data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="paris" data-testid="paris-item" data-slide>Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item" data-slide>Oslo</carousel.item>
				<carousel.item value="lima" data-testid="lima-item" data-slide>Lima</carousel.item>
			</carousel.scrollarea>
			<carousel.backtrigger data-testid="backtrigger">Back</carousel.backtrigger>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
			<carousel.navlist data-testid="navlist">
				<carousel.navtrigger value="paris" data-testid="paris-navtrigger">Paris</carousel.navtrigger>
				<carousel.navtrigger value="oslo" data-testid="oslo-navtrigger">Oslo</carousel.navtrigger>
				<carousel.navtrigger value="lima" data-testid="lima-navtrigger">Lima</carousel.navtrigger>
			</carousel.navlist>
		</carousel.root>
	</section>
}
