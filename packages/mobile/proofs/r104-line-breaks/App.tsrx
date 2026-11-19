import { state } from '@markless/core';

export default function App() @{
	let city = state('Lyon');
	<main>
		<h1>Line breaks</h1>
		<address>Ada Lovelace<br />12 Rue Example<br />{city}</address>
		<p>Long<wbr />word</p>
		<p>{'Now in ' + city}</p>
		<button onClick={() => (city = 'Paris')}>Move</button>
	</main>
}
