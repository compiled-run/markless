import { state } from '@markless/core';

type User = { name: string; home: { city: string } };

export default function App() @{
	let user = state<User | null>(null);
	<main>
		<h1>Profile</h1>
		<p>Name: {user?.name ?? 'nobody'}</p>
		<p>City: {user?.home.city ?? 'unknown'}</p>
		<button onClick={() => (user = { name: 'Sam', home: { city: 'Lyon' } })}>Sign in</button>
		<button onClick={() => (user = null)}>Sign out</button>
	</main>
}
