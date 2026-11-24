import { state } from '@markless/core';

export default function App() @{
	let likes = state(0);
	<app-root>
		<app-header>
			<h1>Conduit</h1>
		</app-header>
		<router-outlet></router-outlet>
		<app-page>
			<p>Read the feed</p>
			<button onClick={() => (likes = likes + 1)}>Like {likes}</button>
		</app-page>
	</app-root>
}
