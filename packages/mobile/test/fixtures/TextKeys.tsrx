import { state } from '@markless/core';

export default function TextKeys() @{
	let draft = state('');
	let tags = state('');
	let count = state(0);
	let removed = state(0);
	let last = state('none');
	let pasted = state('');
	let notes = state('');
	let sent = state('');
	<main>
		<input
			aria-label="Tag"
			value={draft}
			onInput={(event) => (draft = event.currentTarget.value)}
			onKeyDown={(event) => {
				last = event.key;
				if (event.key === 'Enter') {
					event.preventDefault();
					if (draft !== '') {
						tags = tags === '' ? draft : `${tags}, ${draft}`;
						count = count + 1;
						draft = '';
					}
				} else if (event.key === 'Backspace' && draft === '' && count > 0) {
					event.preventDefault();
					removed = removed + 1;
				}
			}}
			onPaste={(event) => {
				event.preventDefault();
				pasted = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
			}}
		/>
		<textarea
			aria-label="Message"
			value={notes}
			onInput={(event) => (notes = event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' && notes !== '') {
					event.preventDefault();
					sent = notes;
					notes = '';
				}
			}}
		/>
		<p>{`${count} tags: ${tags}; ${removed} removed; last key ${last}`}</p>
		<p>{`pasted ${pasted}; sent ${sent}`}</p>
	</main>
}
