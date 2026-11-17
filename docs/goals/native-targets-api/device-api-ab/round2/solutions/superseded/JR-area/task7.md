```ts
// file: task7/clock.ts
export function clock(seconds: number): string {
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
```

```tsrx
// file: task7/Film.tsrx
import { player } from '@markless/device';
import { clock } from './clock.ts';

export default function Film() @{
	const film = player('/media/intro.mp4');

	<section>
		<film.area />
		<button onClick={() => (film.playing ? film.pause() : film.play())}>{film.playing ? 'Pause' : 'Play'}</button>
		<input type="range" min="0" max={film.duration} step="1" value={film.time} onInput={(event) => film.seek(Number(event.currentTarget.value))} />
		<p>{clock(film.time)}</p>
	</section>
}
```
