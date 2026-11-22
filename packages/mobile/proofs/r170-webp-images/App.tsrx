import { state } from '@markless/core';
import square from '../lib/square.webp';

export default function App() @{
	const shown = state({ more: false });
	<main>
		<h1>WebP images</h1>
		<img src="/static/photo.webp" alt="Orange photo" />
		<img src="/static/turned.webp" alt="Badge as stored" />
		@if (shown.more) {
			<img src={square} alt="Blue square" width="60" />
		}
		<button onClick={() => (shown.more = !shown.more)}>{shown.more ? 'Hide square' : 'Show square'}</button>
	</main>
}
