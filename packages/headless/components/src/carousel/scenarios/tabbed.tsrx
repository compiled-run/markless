import { carousel } from '../../index.ts';

// The same carousel with a nav list, which is the APG's tabbed variant: the
// pickers are tabs and the slides become the panels they control.
export default function Tabbed() @{
	<section>
		<carousel.root value="paris" data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="paris" data-testid="paris-item" data-slide>Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item" data-slide>Oslo</carousel.item>
				<carousel.item value="lima" data-testid="lima-item" data-slide>Lima</carousel.item>
			</carousel.scrollarea>
			<carousel.navlist data-testid="navlist">
				<carousel.navtrigger value="paris" data-testid="paris-navtrigger">1</carousel.navtrigger>
				<carousel.navtrigger value="oslo" data-testid="oslo-navtrigger">2</carousel.navtrigger>
				<carousel.navtrigger value="lima" data-testid="lima-navtrigger">3</carousel.navtrigger>
			</carousel.navlist>
		</carousel.root>
	</section>
}
