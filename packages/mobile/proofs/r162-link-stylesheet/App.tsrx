import { state } from '@markless/core';

export default function App() @{
	const visits = state({ count: 0 });
	<main class="page">
		<link rel="stylesheet" type="text/css" href="/static/site.css" />
		<h1 class="headline">Linked styles</h1>
		<p>{`Visits ${visits.count}`}</p>
		<button class="go" onClick={() => (visits.count = visits.count + 1)}>Visit</button>
	</main>
}
