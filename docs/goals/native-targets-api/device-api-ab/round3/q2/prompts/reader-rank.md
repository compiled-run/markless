Thank you. Here is the same component written four ways, each with a two-letter label; the one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

=== VERSION JE ===
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
=== END VERSION JE ===

=== VERSION UF ===
```tsrx
// file: Header.tsrx
import { platform } from '@markless/device';

export default function Header() @{
	<header>
		@if (platform.web) {
			<aside><a href="/download">Get the app</a></aside>
		}
		<p>{platform.macOS ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
		@if (platform.iOS) {
			<button>Add to Apple Wallet</button>
		}
		@if (platform.android) {
			<p>Swipe back to close</p>
		}
	</header>
}
```
=== END VERSION UF ===

=== VERSION XB ===
```tsrx
// file: Header.tsrx
import { platform } from '@markless/device';

export default function Header() @{
	<header>
		@if (platform.os === 'web') {
			<aside><a href="/download">Get the app</a></aside>
		}
		<p>{platform.os === 'macos' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
		@if (platform.os === 'ios') {
			<button>Add to Apple Wallet</button>
		}
		@if (platform.os === 'android') {
			<p>Swipe back to close</p>
		}
	</header>
}
```
=== END VERSION XB ===

=== VERSION DL ===
```tsrx
// file: Header.tsrx
import { platform } from '@markless/device';

export default function Header() @{
	<header>
		@if (platform === 'web') {
			<aside><a href="/download">Get the app</a></aside>
		}
		<p>{platform === 'macos' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
		@if (platform === 'ios') {
			<button>Add to Apple Wallet</button>
		}
		@if (platform === 'android') {
			<p>Swipe back to close</p>
		}
	</header>
}
```
=== END VERSION DL ===

Questions:
A. Rank the four spellings from easiest to hardest to read.
B. Which would you rather write, and why?
C. In which spelling, if any, is it clearer what the Mac test means on the website (the browser is on a Mac, or this is the Mac app)? Did any spelling change your answer to question 2?

Output format: `## Ranking` with lines `1. XX — reason` … `4. XX — reason`; then `B:` and `C:`; end with `Tools used: none`.
