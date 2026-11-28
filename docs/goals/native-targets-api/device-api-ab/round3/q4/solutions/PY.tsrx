// file: Article.tsrx
import { shared, state, storage } from '@markless/core';
import { location, network, notifications, settings, sharesheet } from '@markless/device';

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
		<button onClick={() => sharesheet.open({ title, url })}>Share</button>
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
