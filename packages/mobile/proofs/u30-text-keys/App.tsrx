import { state } from '@markless/core';

export default function App() @{
	let draft = state('');
	let tags = state('none');
	let count = state(0);
	let removed = state(0);
	let message = state('');
	let sent = state('nothing');
	<main>
		<h1>Labels</h1>
		<input
			aria-label="Tag"
			value={draft}
			onInput={(event) => (draft = event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || (event.key === 'Backspace' && draft === '' && tags !== 'none'))
					event.preventDefault();
				if (event.key === 'Enter' && draft !== '') {
					tags = count === 0 ? draft : `${tags} and ${draft}`;
					count = count + 1;
					draft = '';
				} else if (event.key === 'Backspace' && draft === '' && tags !== 'none') removed = removed + 1;
			}}
		/>
		<p>{`${count} tags: ${tags}`}</p>
		<p>{`Removed ${removed}`}</p>
		<textarea
			aria-label="Message"
			value={message}
			onInput={(event) => (message = event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' && message !== '') event.preventDefault();
				if (event.key === 'Enter' && message !== '') {
					sent = message;
					message = '';
				}
			}}
		/>
		<p>{`Sent ${sent}`}</p>
	</main>
}
