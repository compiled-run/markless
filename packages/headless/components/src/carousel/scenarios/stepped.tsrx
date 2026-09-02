import { carousel } from '../../index.ts';

// Five slides stepped two at a time, with a picker per slide: a walk lands on
// every other picker, and the picker that takes focus is the one for the slide
// showing.
export default function Stepped() @{
	<section>
		<carousel.root value="one" move={2} data-testid="root">
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="one" data-testid="one-item" data-slide>One</carousel.item>
				<carousel.item value="two" data-testid="two-item" data-slide>Two</carousel.item>
				<carousel.item value="three" data-testid="three-item" data-slide>Three</carousel.item>
				<carousel.item value="four" data-testid="four-item" data-slide>Four</carousel.item>
				<carousel.item value="five" data-testid="five-item" data-slide>Five</carousel.item>
			</carousel.scrollarea>
			<carousel.navlist data-testid="navlist">
				<carousel.navtrigger value="one" data-testid="one-navtrigger">1</carousel.navtrigger>
				<carousel.navtrigger value="two" data-testid="two-navtrigger">2</carousel.navtrigger>
				<carousel.navtrigger value="three" data-testid="three-navtrigger">3</carousel.navtrigger>
				<carousel.navtrigger value="four" data-testid="four-navtrigger">4</carousel.navtrigger>
				<carousel.navtrigger value="five" data-testid="five-navtrigger">5</carousel.navtrigger>
			</carousel.navlist>
		</carousel.root>
	</section>
}
