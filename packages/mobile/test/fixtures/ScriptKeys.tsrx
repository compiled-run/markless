import { state } from '@markless/core';

export default function ScriptKeys() @{
	let tags = state(['red']);
	let last = state('none');
	<main>
		<input
			aria-label="Tag"
			onKeyDown={(event) => {
				const typed = (event.target as HTMLInputElement).value;
				let known = false;
				for (const tag of tags) if (tag === typed) known = true;
				if (event.key === 'Enter') {
					event.preventDefault();
					if (!known && typed !== '') tags = [...tags, typed];
				}
				last = `${event.key} ${known ? 'known' : 'new'}`;
			}}
			onPaste={(event) => {
				event.preventDefault();
				const next = [...tags];
				for (const part of (event.clipboardData?.getData('text') ?? '').split(','))
					if (part.trim() !== '') next.push(part.trim());
				tags = next;
			}}
		/>
		<p>{tags.join(', ')}</p>
		<p>{last}</p>
	</main>
}
