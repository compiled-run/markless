import { carousel } from '../../index.ts';

// The slides and their pickers are data: one keyed loop for each, over rows
// that carry the value the slide and its picker share.
const places = [
	{ value: 'paris', name: 'Paris' },
	{ value: 'oslo', name: 'Oslo' },
	{ value: 'lima', name: 'Lima' },
];

export default function SlidesFromData() @{
	<section>
		<carousel.root value="paris" data-testid="root">
			<carousel.title data-testid="title">Featured destinations</carousel.title>
			<carousel.scrollarea data-testid="scrollarea">
				@for (const place of places; key place.value) {
					<carousel.item value={place.value} data-testid={`${place.value}-item`}>{place.name}</carousel.item>
				}
			</carousel.scrollarea>
			<carousel.navlist data-testid="navlist">
				@for (const place of places; key place.value) {
					<carousel.navtrigger value={place.value} data-testid={`${place.value}-navtrigger`}>{place.name}</carousel.navtrigger>
				}
			</carousel.navlist>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
	</section>
}
