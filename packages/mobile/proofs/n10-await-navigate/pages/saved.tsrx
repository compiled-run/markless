import { navigate } from '@markless/router';

export default function Saved() @{
	<main>
		<title>Saved</title>
		<h1>Draft saved</h1>
		<button onClick={async () => await navigate('/', { replace: true })}>New draft</button>
	</main>
}
