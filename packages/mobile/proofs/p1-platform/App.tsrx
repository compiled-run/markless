import { platform } from '@markless/device';

export default function App() @{
	<main>
		<h1>Platform</h1>
		@if (platform.ios) {
			<p>Built for iOS</p>
		} @else if (platform.android) {
			<p>Built for Android</p>
		} @else {
			<p>Built for the web</p>
		}
	</main>
}
