```ts
// file: task7/clock.ts
export function clock(seconds: number): string {
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
```

```tsrx
// file: task7/Film.tsrx
import { element, state } from '@markless/core';
import { Video, type VideoElement } from '@markless/device';
import { clock } from './clock.ts';

export default function Film() @{
	let film = element<VideoElement>();
	let playing = state(false);
	let time = state(0);
	let duration = state(0);

	<section>
		<Video
			el={film}
			src="/media/intro.mp4"
			onPlay={() => (playing = true)}
			onPause={() => (playing = false)}
			onTime={(seconds) => (time = seconds)}
			onDuration={(seconds) => (duration = seconds)}
		/>
		<button onClick={() => (playing ? film?.pause() : film?.play())}>{playing ? 'Pause' : 'Play'}</button>
		<input type="range" min="0" max={duration} step="1" value={time} onInput={(event) => film?.seek(Number(event.currentTarget.value))} />
		<p>{clock(time)}</p>
	</section>
}
```
