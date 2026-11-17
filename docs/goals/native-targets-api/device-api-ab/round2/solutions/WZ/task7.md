```tsrx
// file: task7/Film.tsrx
import { player } from '@markless/device';

export default function Film() @{
	const film = player.handle();

	<player.root handle={film} src="/media/intro.mp4">
		<player.area />
		<player.trigger>{film.playing ? 'Pause' : 'Play'}</player.trigger>
		<player.indicator />
		<player.label />
	</player.root>
}
```
