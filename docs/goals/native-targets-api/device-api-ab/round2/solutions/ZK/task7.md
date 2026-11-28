```tsrx
// file: task7/Film.tsrx
import { player } from '@markless/device';

export default function Film() @{
	const film = player('/media/intro.mp4');

	<section>
		<player el={film} />
		<player.trigger of={film}>{film.playing ? 'Pause' : 'Play'}</player.trigger>
		<player.indicator of={film} />
		<player.label of={film} />
	</section>
}
```
