You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks; `shared()` and `storage()` come from Markless itself (`@markless/core`).

This app is built from one codebase as an iPhone app, an Android app, a Mac app, a Windows app and a website. `platform` comes from `@markless/device`. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: Header.tsrx
import { platform } from '@markless/device';

export default function Header() @{
	<header>
		@if (platform.web) {
			<aside><a href="/download">Get the app</a></aside>
		}
		<p>{platform.macos ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
		@if (platform.ios) {
			<button>Add to Apple Wallet</button>
		}
		@if (platform.android) {
			<p>Swipe back to close</p>
		}
	</header>
}
```
=== END CODE ===

Questions:
1. Who sees each of the four pieces: the "Get the app" link, each search hint, "Add to Apple Wallet", "Swipe back to close"?
2. Someone opens the website in Safari on a Mac. Which search hint do they see? Is the Mac test in this code true for them? Pick one and explain: (a) yes, because the browser is running on a Mac; (b) no, because this is the website build, not the Mac app; (c) the code does not let me tell.
3. Someone opens the website in Safari on an iPhone. Do they see "Add to Apple Wallet"? Why?
4. How sure are you of your answers to questions 2 and 3 (1–5)?

Output format: lines `1:`, `2:` (start with the letter you picked), `3:`, `4:`; end with `Tools used: none`.
