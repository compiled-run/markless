You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks; `shared()` and `storage()` come from Markless itself (`@markless/core`).

This app runs on phones. `@markless/device` is a package of device features. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: Article.tsrx
import { shared, state, storage } from '@markless/core';
import { location, network, notifications, settings, share } from '@markless/device';

export const readingList = shared(() => {
	const box = state({ ids: [] as string[] });
	return { ...box };
});

export default function Article({ id, title, url }: { id: string; title: string; url: string }) @{
	const list = readingList();
	let textSize = storage('text-size', 'normal');
	const here = location();
	const net = network();

	<article class={textSize}>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<button onClick={() => (textSize = textSize === 'large' ? 'normal' : 'large')}>Text size</button>
		<button onClick={() => (list.ids = [...list.ids, id])}>Save for later</button>
		<button onClick={() => share.open({ title, url })}>Share</button>
		<button onClick={() => notifications.schedule({ title: `Read ${title}`, at: new Date(Date.now() + 3_600_000), url })}>
			Remind me in an hour
		</button>
		@if (here.access === 'denied') {
			<button onClick={() => settings.open()}>Turn on location in Settings</button>
		} @else if (here.position) {
			<p>{`Reading near ${here.position.latitude.toFixed(2)}, ${here.position.longitude.toFixed(2)}`}</p>
		}
	</article>
}
```
=== END CODE ===

Questions:
1. For each imported name (`shared`, `state`, `storage`, `location`, `network`, `notifications`, `settings`, `share`), say in a few words what it is and what it does here.
2. What happens when the person presses each button: "Text size", "Save for later", "Share", "Remind me in an hour", "Turn on location in Settings"? Who else, if anyone, sees the result?
3. Does any name here look like something else you know, from Markless, the browser or elsewhere? Which, and did it make you unsure what the code does?

Output format: lines `1:` (one sub-line per name), `2:` (one sub-line per button), `3:`; end with `Tools used: none`.
