import { computed } from '@markless/core';
import { location, platform } from '@markless/device';

function Here() @{
	const here = computed(async () => location.current());
	@try {
		<p>{here.latitude}, {here.longitude}</p>
	} @pending {
		<p>Locating</p>
	} @catch (error) {
		<p>{error.name}</p>
	}
}

export default function App() @{
	<main>
		@if (!platform.web) {
			<Here />
		} @else {
			<p>Location is not available here</p>
		}
	</main>
}
