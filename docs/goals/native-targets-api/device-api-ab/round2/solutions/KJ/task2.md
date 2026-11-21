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
import { device, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Body({ cam, photo, onReady }: { cam: CameraElement | undefined; photo: Photo | null; onReady: () => void }) @{
	let facing = state<Facing>('back');
	let denied = state(false);

	<section>
		@if (denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => device.openSettings()}>Open Settings</button>
			</div>
		} @else {
			<device.camera el={cam} facing={facing} onReady={() => onReady()} onDenied={() => (denied = true)} />
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
import type { CameraElement, Photo } from '@markless/device';
import Body from './Body.tsrx';
import Header from './Header.tsrx';

export default function Page() @{
	let cam = element<CameraElement>();
	let ready = state(false);
	let photo = state<Photo | null>(null);

	<main>
		<Header ready={ready} onShutter={async () => { if (cam) photo = await cam.takePhoto(); }} />
		<Body cam={cam} photo={photo} onReady={() => (ready = true)} />
	</main>
}
```
