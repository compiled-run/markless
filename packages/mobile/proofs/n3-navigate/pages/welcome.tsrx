import { navigate } from '@markless/router';

export default function Welcome() @{
	<main>
		<title>Welcome</title>
		<h1>Signed in</h1>
		<button onClick={() => navigate('/dashboard', { replace: true })}>Continue</button>
	</main>
}
