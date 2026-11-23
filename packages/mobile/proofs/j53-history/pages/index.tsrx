import { state } from '@markless/core';
import { navigate } from '@markless/router';

export default function Home() @{
	let shown = state('Not read yet');
	<main>
		<title>Home</title>
		<h1>Story list</h1>
		<p>{shown}</p>
		<button
			onClick={() => {
				history.replaceState({ kept: 7 }, '');
				shown = 'Kept seven';
			}}
		>
			Keep seven
		</button>
		<button
			onClick={() => (shown = `Read: ${JSON.stringify(history.state)}`)}
		>
			Read state
		</button>
		<button onClick={() => (shown = `Back home: ${JSON.stringify(history.state)}`)}>Read again</button>
		<button
			onClick={async () => {
				await navigate('/login');
				history.replaceState({ from: 'home' }, '', '/vote?id=7');
			}}
		>
			Upvote
		</button>
	</main>
}
