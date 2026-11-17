import { network } from '@markless/device';

export default function App() @{
	<main>
		<h1>Connection</h1>
		<p>{network.online ? 'Online' : 'Offline'}</p>
	</main>
}
