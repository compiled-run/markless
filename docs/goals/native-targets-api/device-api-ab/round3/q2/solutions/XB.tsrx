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
