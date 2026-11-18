import { computed } from '@markless/core';
import { location, platform, settings } from '@markless/device';

function Where() @{
	const here = computed(async () => location.current());
	<section>
		<p>Access {location.access}</p>
		@if (location.access === 'denied' || location.access === 'blocked') {
			<div>
				<p>Location is off for this app</p>
				<button onClick={() => settings.open()}>Open Settings</button>
			</div>
		}
		@try {
			<p>Found you at {here.latitude}</p>
		} @pending {
			<p>Locating</p>
		} @catch (error) {
			<p>{error.name}</p>
		}
	</section>
}

export default function App() @{
	<main>
		<h1>Where you are</h1>
		@if (!platform.web) {
			<Where />
		} @else {
			<p>Location is not available here</p>
		}
	</main>
}
