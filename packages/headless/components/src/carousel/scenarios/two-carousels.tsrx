import { carousel } from '../../index.ts';

// Two carousels on one page, sharing slide values on purpose: a trigger in one
// must never move the other.
export default function TwoCarousels() @{
	<section>
		<carousel.root value="one" data-testid="left-root">
			<carousel.scrollarea data-testid="left-scrollarea" data-viewport>
				<carousel.item value="one" data-testid="left-one" data-slide>Left one</carousel.item>
				<carousel.item value="two" data-testid="left-two" data-slide>Left two</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger data-testid="left-forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
		<carousel.root value="one" data-testid="right-root">
			<carousel.scrollarea data-testid="right-scrollarea" data-viewport>
				<carousel.item value="one" data-testid="right-one" data-slide>Right one</carousel.item>
				<carousel.item value="two" data-testid="right-two" data-slide>Right two</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger data-testid="right-forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
	</section>
}
