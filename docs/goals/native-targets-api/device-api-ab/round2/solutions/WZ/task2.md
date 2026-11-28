```ts
// file: task2/shot.ts
import { camera } from '@markless/device';

export const shot = camera.handle();
```

```tsrx
// file: task2/Header.tsrx
import { camera } from '@markless/device';
import { shot } from './shot.ts';

export default function Header() @{
	<header>
		<h1>Camera</h1>
		<camera.trigger for={shot}>Take photo</camera.trigger>
	</header>
}
```

```tsrx
// file: task2/Body.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Facing, type Photo } from '@markless/device';
import { shot } from './shot.ts';

export default function Body() @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);

	<section>
		<camera.root handle={shot} facing={facing} onCapture={(next) => (photo = next)}>
			<camera.area />
			<camera.error>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</camera.error>
			<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		</camera.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
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
