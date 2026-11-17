You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Below are six versions of the same three small phone-app screens, written in Markless (a UI framework whose components live in `.tsrx` files) against six different designs of a device package, `@markless/device`. Each design has a two-letter label. You get only the code: no documentation for either package. Read the code and answer from what it shows.

=== DESIGN KO ===

--- KO, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { element, state } from '@markless/core';
import { CameraView, cameraPermission, type CameraViewElement, type Picture } from '@markless/device';

export default function Shooter() @{
	const permission = cameraPermission();
	let cam = element<CameraViewElement>();
	let facing = state<'front' | 'back'>('back');
	let photo = state<Picture | null>(null);

	<section>
		@if (permission.state === 'granted') {
			<div>
				<CameraView el={cam} facing={facing} />
				<button onClick={async () => { if (cam) photo = await cam.takePicture(); }}>Take photo</button>
				<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
			</div>
		} @else {
			<div>
				@if (permission.state === 'denied') {
					<p>Camera access is off. Allow it in Settings to take photos.</p>
				} @else {
					<button onClick={() => permission.request()}>Allow camera</button>
				}
			</div>
		}
		@if (photo) {
			<img src={photo.uri} alt="Last photo" />
		}
	</section>
}
```

--- KO, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { computed } from '@markless/core';
import { Linking, Location, locationPermission } from '@markless/device';

export default function WhereAmI() @{
	const permission = locationPermission();
	const where = computed(async () => {
		if (permission.state !== 'granted' && (await permission.request()) !== 'granted') {
			throw new Error('Location access is off. Turn it on in Settings.');
		}
		return await Location.getCurrentPosition();
	});

	<section>
		@try {
			<p>{`${where.coords.latitude.toFixed(5)}, ${where.coords.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.message}</p>
				<button onClick={() => Linking.openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

--- KO, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```tsrx
import { state } from '@markless/core';
import { AudioRecorder, microphonePermission } from '@markless/device';

export default function Memo() @{
	const permission = microphonePermission();
	let recording = state(false);
	let seconds = state(0);
	let clipUri = state('');

	<section>
		@if (recording) {
			<div attach={() => AudioRecorder.addListener('progress', (status) => (seconds = status.seconds))}>
				<p>{`Recording… ${seconds}s`}</p>
				<button
					onClick={async () => {
						const clip = await AudioRecorder.stop();
						recording = false;
						clipUri = clip.uri;
					}}
				>
					Stop
				</button>
			</div>
		} @else {
			<button
				onClick={async () => {
					if (permission.state !== 'granted' && (await permission.request()) !== 'granted') return;
					seconds = 0;
					await AudioRecorder.start();
					recording = true;
				}}
			>
				Record
			</button>
		}
		@if (clipUri) {
			<audio controls src={clipUri} />
		}
	</section>
}
```

=== END DESIGN KO ===

=== DESIGN AU ===

--- AU, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { computed, state } from '@markless/core';
import { getUserMedia, MediaView, takePhoto } from '@markless/device';

export default function Shooter() @{
	let facingMode = state<'user' | 'environment'>('environment');
	let photoUrl = state('');
	const stream = computed(async () => await getUserMedia({ video: { facingMode } }));

	<section>
		@try {
			<>
				<MediaView srcObject={stream} />
				<button onClick={async () => { photoUrl = URL.createObjectURL(await takePhoto(stream.getVideoTracks()[0])); }}>Take photo</button>
			</>
		} @pending {
			<p>Starting camera…</p>
		} @catch (error) {
			<p>{error.name === 'NotAllowedError' ? 'Camera access is off. Allow it in Settings to take photos.' : error.message}</p>
		}
		<button onClick={() => (facingMode = facingMode === 'user' ? 'environment' : 'user')}>Switch camera</button>
		@if (photoUrl) {
			<img src={photoUrl} alt="Last photo" />
		}
	</section>
}
```
Config: `grants` includes `'camera'` in `markless.config.ts`, with its usage text under `"camera"` in `strings/permissions.json`.

--- AU, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { computed } from '@markless/core';
import { getCurrentPosition, openAppSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async () => await getCurrentPosition());

	<section>
		@try {
			<p>{`${where.coords.latitude.toFixed(5)}, ${where.coords.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openAppSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```
Config: `grants` includes `'geolocation'` in `markless.config.ts`, with its usage text under `"geolocation"` in `strings/permissions.json`.

--- AU, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```ts
// src/memo.ts
import { getUserMedia, MediaRecorder } from '@markless/device';

let active: MediaRecorder | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export async function startMemo(onTick: (seconds: number) => void, onClip: (url: string) => void) {
	const stream = await getUserMedia({ audio: true });
	const chunks: Blob[] = [];
	active = new MediaRecorder(stream);
	active.ondataavailable = (event) => chunks.push(event.data);
	active.onstop = () => {
		stream.getTracks().forEach((track) => track.stop());
		onClip(URL.createObjectURL(new Blob(chunks)));
	};
	const started = Date.now();
	timer = setInterval(() => onTick(Math.floor((Date.now() - started) / 1000)), 1000);
	active.start();
}

export function stopMemo() {
	clearInterval(timer);
	active?.stop();
	active = undefined;
}
```

```tsrx
import { state } from '@markless/core';
import { startMemo, stopMemo } from './memo.ts';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clipUrl = state('');

	<section>
		@if (recording) {
			<>
				<p>{`Recording… ${seconds}s`}</p>
				<button onClick={() => { stopMemo(); recording = false; }}>Stop</button>
			</>
		} @else {
			<button
				onClick={async () => {
					seconds = 0;
					await startMemo((next) => (seconds = next), (url) => (clipUrl = url));
					recording = true;
				}}
			>
				Record
			</button>
		}
		@if (clipUrl) {
			<audio controls src={clipUrl} />
		}
	</section>
}
```
Config: `grants` includes `'microphone'` in `markless.config.ts`, with its usage text under `"microphone"` in `strings/permissions.json`.

=== END DESIGN AU ===

=== DESIGN MS ===

--- MS, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { state } from '@markless/core';
import { camera, Preview, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (cam.status === 'denied') {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<Preview of={cam} />
		}
		<button onClick={async () => { photo = await cam.capture(); }}>Take photo</button>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

--- MS, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { location, settings } from '@markless/device';

export default function WhereAmI() @{
	const where = location();
	const phoneSettings = settings();

	<section>
		@if (where.status === 'denied') {
			<div>
				<p>Location access is off. Turn it on in Settings.</p>
				<button onClick={() => phoneSettings.open()}>Open Settings</button>
				<button onClick={() => where.refresh()}>Try again</button>
			</div>
		} @else {
			<p>{where.position ? `${where.position.latitude.toFixed(5)}, ${where.position.longitude.toFixed(5)}` : 'Finding your location…'}</p>
		}
	</section>
}
```

--- MS, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		@if (rec.recording) {
			<>
				<p>{`Recording… ${rec.elapsed}s`}</p>
				<button onClick={() => rec.stop()}>Stop</button>
			</>
		} @else {
			<button onClick={() => rec.start()}>Record</button>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```

=== END DESIGN MS ===

=== DESIGN BC ===

--- BC, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { element, state } from '@markless/core';
import { cameraPreview, capturePhoto, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let video = element<HTMLVideoElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let refused = state(false);

	<section>
		@if (refused) {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<video el={video} autoplay playsinline muted attach={cameraPreview({ facing, onError: (error) => (refused = error.name === 'NotAllowedError') })} />
		}
		<button onClick={async () => { photo = await capturePhoto(video); }}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

--- BC, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { computed } from '@markless/core';
import { getPosition, openSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async ({ signal }) => await getPosition({ signal }));

	<section>
		@try {
			<p>{`${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

--- BC, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```ts
// src/memo.ts
import { startRecording, type Recording } from '@markless/device';

let active: Recording | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export async function begin(onTick: (seconds: number) => void) {
	active = await startRecording({ kind: 'audio' });
	const started = Date.now();
	timer = setInterval(() => onTick(Math.floor((Date.now() - started) / 1000)), 1000);
}

export async function end(): Promise<string> {
	clearInterval(timer);
	const recording = active;
	active = undefined;
	if (!recording) return '';
	const clip = await recording.stop();
	return clip.url;
}
```

```tsrx
import { state } from '@markless/core';
import { begin, end } from './memo.ts';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clipUrl = state('');

	<section>
		@if (recording) {
			<>
				<p>{`Recording… ${seconds}s`}</p>
				<button onClick={async () => { recording = false; clipUrl = await end(); }}>Stop</button>
			</>
		} @else {
			<button
				onClick={async () => {
					seconds = 0;
					await begin((next) => (seconds = next));
					recording = true;
				}}
			>
				Record
			</button>
		}
		@if (clipUrl) {
			<audio controls src={clipUrl} />
		}
	</section>
}
```

=== END DESIGN BC ===

=== DESIGN EJ ===

--- EJ, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { element, state } from '@markless/core';
import { Camera, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let camera = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let refused = state(false);

	<section>
		@if (refused) {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<Camera el={camera} facing={facing} onChange={(next) => (photo = next)} onError={(error) => (refused = error.name === 'NotAllowedError')} />
		}
		<button onClick={() => camera?.capture()}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

--- EJ, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { computed } from '@markless/core';
import { currentPosition, openSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async () => await currentPosition());

	<section>
		@try {
			<p>{`${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

--- EJ, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		@if (rec.recording) {
			<>
				<p>{`Recording… ${rec.elapsed}s`}</p>
				<button onClick={() => rec.stop()}>Stop</button>
			</>
		} @else {
			<button onClick={() => rec.start()}>Record</button>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```

=== END DESIGN EJ ===

=== DESIGN UW ===

--- UW, Task 2: live camera preview, shutter, front/back switch, last photo, message when camera access is refused ---
```tsrx
import { state } from '@markless/core';
import { camera, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);

	<camera.root facing={facing} onChange={(next: Photo) => (photo = next)}>
		<camera.area />
		<camera.error>Camera access is off. Allow it in Settings to take photos.</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```

--- UW, Task 3: current location as text, loading state, refused-access message with "Open Settings" and "Try again" ---
```tsrx
import { computed } from '@markless/core';
import { currentPosition, openSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async () => await currentPosition());

	<section>
		@try {
			<p>{`${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

--- UW, Task 6: voice memo, start/stop, elapsed seconds while recording, play back ---
```tsrx
import { state } from '@markless/core';
import { recorder, type Clip } from '@markless/device';

export default function Memo() @{
	let clip = state<Clip | null>(null);

	<recorder.root onChange={(next: Clip) => (clip = next)}>
		<recorder.trigger>Start or stop recording</recorder.trigger>
		<recorder.indicator>Recording… <recorder.valuelabel />s</recorder.indicator>
		@if (clip) {
			<audio controls src={clip.url} />
		}
	</recorder.root>
}
```

=== END DESIGN UW ===

Answer these questions for every design, judging only from its code:

Task 2, camera:
- Q1. If the person refuses camera access, what do they see on screen?
- Q2. Which camera (front or back) is used at the start?
- Q3. After the shutter is pressed, where does the photo end up?
- Q4. Is the camera view one element on screen, or several elements working together?

Task 3, location:
- Q5. What does the person see while the location is loading?
- Q6. If the person refuses location access, what do they see?
- Q7. The person taps "Open Settings", turns location on, and comes back to the app. What happens next, and does the page update by itself?
- Q8. What exactly does "Try again" do?

Task 6, voice memo:
- Q9. What stops the recording?
- Q10. Where does the elapsed-seconds number come from?
- Q11. How is the finished clip played back?

Output format:
- For each design, in the order shown above, a heading `## <label>` and then eleven lines `Q1: …` to `Q11: …`, one short sentence each. If the code does not show the answer, say what you would assume and that it is not shown.
- Then a heading `## Ranking`: the six labels from clearest to least clear to read, one per line as `<rank>. <label>: <one-line reason>`.
- End with a line `Tools used: none` (or name any tool you used).
