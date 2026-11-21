import { state } from '@markless/core';

export default function App() @{
	let tags = state(['red']);
	let draft = state('');
	let note = state('Nothing added');
	<main>
		<h1>Tags</h1>
		<input
			aria-label="Tag"
			value={draft}
			onInput={(event) => (draft = event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				const typed = (event.target as HTMLInputElement).value.trim();
				let known = false;
				for (const tag of tags) if (tag === typed) known = true;
				if (typed === '') note = 'Type a tag first';
				else if (known) note = `Already have ${typed}`;
				else {
					tags = [...tags, typed];
					note = `Added ${typed}`;
					draft = '';
				}
			}}
		/>
		<p>Tags: {tags.join(', ')}</p>
		<p>{note}</p>
	</main>
}
