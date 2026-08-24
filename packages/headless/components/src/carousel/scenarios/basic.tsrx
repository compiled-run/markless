import * as carousel from '../index.ts';

// The starter a consumer copies: a title, three slides, and the two triggers
// that step through them. No nav list, so the slides stay plain groups.
export default function Basic() @{
	<section>
		<carousel.root value="paris" data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.playtrigger data-testid="playtrigger">Play</carousel.playtrigger>
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="paris" data-testid="paris-item" data-slide>Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item" data-slide>Oslo</carousel.item>
				<carousel.item value="lima" data-testid="lima-item" data-slide>Lima</carousel.item>
			</carousel.scrollarea>
			<carousel.backtrigger data-testid="backtrigger">Back</carousel.backtrigger>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
	</section>
}
