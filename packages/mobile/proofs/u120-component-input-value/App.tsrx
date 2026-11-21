import { state } from '@markless/core';

function TitleField({ title }: { readonly title: string }) @{
	<input name="title" aria-label="Title" value={title} />
}

export default function App() @{
	let count = state(0);
	<main>
		<h1>New note</h1>
		<form onSubmit={(event) => event.preventDefault()}>
			<TitleField title="" />
		</form>
		<button onClick={() => count++}>Bumped {count}</button>
	</main>
}
