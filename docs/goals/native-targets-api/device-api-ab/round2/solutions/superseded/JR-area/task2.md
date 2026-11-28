```tsrx
// file: task2/shots.tsrx
import { shared, state } from '@markless/core';
import type { Photo } from '@markless/device';

export const shots = shared(() => {
	const box = state<{ last: Photo | null }>({ last: null });
	return box;
});
```

```tsrx
// file: task2/Header.tsrx
import { named, type Camera } from '@markless/device';
import { shots } from './shots.tsrx';

export default function Header() @{
	const cam = named<Camera>('main');
	const s = shots();

	<header>
		<h1>Camera</h1>
		<button
			disabled={!cam?.ready}
			onClick={async () => {
				if (cam) s.last = await cam.capture();
			}}
		>
			Take photo
		</button>
	</header>
}
```

```tsrx
// file: task2/Body.tsrx
import { camera, openSettings } from '@markless/device';
import { shots } from './shots.tsrx';

export default function Body() @{
	const cam = camera({ facing: 'back', name: 'main' });
	const s = shots();

	<section>
		@if (cam.denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<cam.area />
		}
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Flip camera</button>
		@if (s.last) {
			<img src={s.last.url} alt="Last photo" />
		}
	</section>
}
```

```tsrx
// file: task2/Page.tsrx
import Body from './Body.tsrx';
import Header from './Header.tsrx';

export default function Page() @{
	<main>
		<Header />
		<Body />
	</main>
}
```
