import { computed } from '@markless/core';
import { location, platform } from '@markless/device';

function Here() @{
	const here = computed(async () => location.current());
	<section>
		<p>Access {location.access}</p>
		@try {
			<p>{here.latitude}, {here.longitude}</p>
		} @pending {
			<p>Locating</p>
		} @catch (error) {
			<p>{error.name}</p>
		}
	</section>
}

export default function App() @{
	<main>
		<h1>Location</h1>
		@if (!platform.web) {
			<Here />
		} @else {
			<p>Location is not available here</p>
		}
	</main>
}
