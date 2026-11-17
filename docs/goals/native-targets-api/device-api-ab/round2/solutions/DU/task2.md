```tsrx
// file: task2/Header.tsrx
export default function Header({ ready, onShutter }: { ready: boolean; onShutter: () => void }) @{
	<header>
		<h1>Camera</h1>
		<button disabled={!ready} onClick={() => onShutter()}>Take photo</button>
	</header>
}
```

```tsrx
// file: task2/Body.tsrx
import { state } from '@markless/core';
import { Camera, openSettings, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Body({ camera, onReady }: { camera: CameraElement | undefined; onReady: () => void }) @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let refused = state(false);

	<section>
		@if (refused) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<Camera
				el={camera}
				facing={facing}
				onReady={() => onReady()}
				onChange={(next) => (photo = next)}
				onError={(error) => (refused = error.name === 'NotAllowedError')}
			/>
		}
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

```tsrx
// file: task2/Page.tsrx
import { element, state } from '@markless/core';
import type { CameraElement } from '@markless/device';
import Body from './Body.tsrx';
import Header from './Header.tsrx';

export default function Page() @{
	let camera = element<CameraElement>();
	let ready = state(false);

	<main>
		<Header ready={ready} onShutter={() => camera?.capture()} />
		<Body camera={camera} onReady={() => (ready = true)} />
	</main>
}
```
