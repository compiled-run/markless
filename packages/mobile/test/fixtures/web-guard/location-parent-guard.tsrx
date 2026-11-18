import { platform } from '@markless/device';
import { Here } from './location-child.tsrx';

export default function App() @{
	<main>
		@if (!platform.web) {
			<Here />
		}
	</main>
}
