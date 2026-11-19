import { computed, state } from '@markless/core';
import { location, native, platform } from '@markless/device';

const ACCESS: Record<string, string> = {
	granted: 'Allowed',
	denied: 'Not allowed',
	unknown: 'Asks first',
};

function Here() @{
	let details = state(false);
	const here = computed(async () => location.current());
	<section>
		<p>Location {ACCESS[location.access]}</p>
		@try {
			<p>{here.latitude}, {here.longitude}</p>
		} @pending {
			<p>Locating</p>
		} @catch (error) {
			<p>{error.name}</p>
		}
		<button onClick={() => (details = true)}>Show details</button>
		<native.sheet open={details} onChange={(open) => (details = open)}>
			<h2>Details</h2>
			<button onClick={() => (details = false)}>Close details</button>
		</native.sheet>
	</section>
}

export default function Where() @{
	<main>
		<title>Where</title>
		@if (!platform.web) {
			<Here />
		} @else {
			<p>Location is not available here</p>
		}
	</main>
}
