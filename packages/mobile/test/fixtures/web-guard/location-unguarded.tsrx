import { computed } from '@markless/core';
import { location } from '@markless/device';

export default function App() @{
	const here = computed(async () => location.current());
	<main>
		@try {
			<p>{here.latitude}, {here.longitude}</p>
		} @pending {
			<p>Locating</p>
		} @catch (error) {
			<p>{error.name}</p>
		}
	</main>
}
