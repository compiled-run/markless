import { navigate } from '@markless/router';

export default function Home() @{
	<main>
		<title>Home</title>
		<h1>Welcome screen ahead</h1>
		<button onClick={() => navigate('/welcome')}>Sign in</button>
	</main>
}
