import { storage } from '@markless/core';
import { Link } from '@markless/router';

export default function Home() @{
	let site = storage('site', 'North yard');
	<main>
		<title>Home</title>
		<h1>Home page</h1>
		<p>{`Working at ${site}`}</p>
		<Link href="/settings">Settings</Link>
	</main>
}
