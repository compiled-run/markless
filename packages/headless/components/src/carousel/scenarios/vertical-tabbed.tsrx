import { carousel } from '../../index.ts';

// Slides stacked down the page with a nav list: the pickers walk on Up and Down.
export default function VerticalTabbed() @{
	<section>
		<carousel.root value="top" orientation="vertical" data-testid="root">
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="top" data-testid="top-item" data-slide>Top</carousel.item>
				<carousel.item value="middle" data-testid="middle-item" data-slide>Middle</carousel.item>
				<carousel.item value="bottom" data-testid="bottom-item" data-slide>Bottom</carousel.item>
			</carousel.scrollarea>
			<carousel.navlist data-testid="navlist">
				<carousel.navtrigger value="top" data-testid="top-navtrigger">1</carousel.navtrigger>
				<carousel.navtrigger value="middle" data-testid="middle-navtrigger">2</carousel.navtrigger>
				<carousel.navtrigger value="bottom" data-testid="bottom-navtrigger">3</carousel.navtrigger>
			</carousel.navlist>
		</carousel.root>
	</section>
}
