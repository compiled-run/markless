import * as carousel from '../index.ts';
import { CAROUSEL_CSS } from './carousel-css.ts';

// No title part. The APG says a carousel's name must not contain the word
// carousel, and the role description already says it, so an unnamed carousel
// gets no name rather than a bad one.
export default function Untitled() @{
	<section>
		<style>{CAROUSEL_CSS}</style>
		<carousel.root value="one" data-testid="root">
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="one" data-testid="one-item" data-slide>One</carousel.item>
				<carousel.item value="two" data-testid="two-item" data-slide>Two</carousel.item>
			</carousel.scrollarea>
		</carousel.root>
	</section>
}
