import { state } from '@markless/core';

export default function Home() @{
	let sent = state(0);
	<main data-page="home">
		<a href="/list" data-list>List</a>
		<a href="/live" data-live>Live</a>
		<a href="/brief" data-brief>Brief</a>
		<a href="/hosted" data-hosted>Hosted</a>
		<form
			data-form
			onSubmit={(event) => {
				event.preventDefault();
				sent++;
			}}
		>
			<button type="submit">Send {sent}</button>
		</form>
	</main>
}
