import { carousel } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. The nav list is the APG's tabbed variant, and its pickers
// are the roving roster a merged element handle would walk straight out of.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<carousel.root value="paris" data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.scrollarea data-testid="scrollarea">
				<carousel.item value="paris" data-testid="paris-item">Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item">Oslo</carousel.item>
				<carousel.item value="lima" data-testid="lima-item">Lima</carousel.item>
			</carousel.scrollarea>
			<carousel.navlist data-testid="navlist">
				<carousel.navtrigger value="paris" data-testid="paris-navtrigger">1</carousel.navtrigger>
				<carousel.navtrigger value="oslo" data-testid="oslo-navtrigger">2</carousel.navtrigger>
				<carousel.navtrigger value="lima" data-testid="lima-navtrigger">3</carousel.navtrigger>
			</carousel.navlist>
		</carousel.root>
	</section>
}
