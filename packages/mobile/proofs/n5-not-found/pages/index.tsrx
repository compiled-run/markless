import { state } from '@markless/core';
import { Link, navigate } from '@markless/router';

export default function Home() @{
	let user = state('sam');
	<main>
		<title>Home</title>
		<h1>Account</h1>
		<Link href={`/logout/${user}`}>Log out</Link>
		<button onClick={() => navigate('/settings')}>Settings</button>
	</main>
}
