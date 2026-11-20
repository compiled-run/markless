import { state } from '@markless/core';
import photo from '../lib/photo.jpg';
import turned from '../lib/turned.jpg';

export default function App() @{
	const shown = state({ more: false });
	<main>
		<h1>Images</h1>
		<img src="/static/badge.png" alt="Green badge" />
		<img src={photo} alt="Orange photo" width="160" />
		<img src={turned} alt="Turned photo" />
		<img src="/static/broken.png" alt="No such picture" />
		@if (shown.more) {
			<img src="/static/second.png" alt="Blue square" />
		}
		<button onClick={() => (shown.more = !shown.more)}>{shown.more ? 'Hide square' : 'Show square'}</button>
	</main>
}
