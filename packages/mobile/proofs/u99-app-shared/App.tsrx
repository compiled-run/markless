import { Bumper, Readout } from '../lib/AppCount.tsrx';

export default function App() @{
	<main>
		<h1>App-wide state</h1>
		<Readout label="Top" />
		<section>
			<Bumper />
		</section>
		<aside>
			<Readout label="Side" />
		</aside>
	</main>
}
