import { state } from '@markless/core';

export default function Login() @{
	let shown = state('Login not read');
	<main>
		<title>Login</title>
		<h1>Log in to vote</h1>
		<p>{shown}</p>
		<button onClick={() => (shown = `Login read: ${JSON.stringify(history.state)}`)}>Read login state</button>
	</main>
}
