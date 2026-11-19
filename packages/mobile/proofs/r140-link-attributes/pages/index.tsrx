import { state } from '@markless/core';
import { Link } from '@markless/router';
import Tabs from '../lib/Tabs.tsrx';

export default function Home() @{
	let choice = state('apple');
	<main>
		<title>Home</title>
		<Tabs tab="home" />
		<button onClick={() => (choice = 'pear')}>Choose pear</button>
		<Link href={`/items/${choice}`}>Open {choice}</Link>
	</main>
}
