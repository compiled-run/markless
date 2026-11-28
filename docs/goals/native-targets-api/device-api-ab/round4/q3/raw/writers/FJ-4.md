```tsx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base, native, tabs } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<section class="panel">
		<native.camera el={cam} class="fill" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					last = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img class="fill" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
	</section>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<section class="panel">
		<native.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill"
		/>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</section>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill { display: block; width: 100%; }
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			[ui-selected] { font-weight: bold; }
		`}</style>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="camera">Camera</tabs.trigger>
				<tabs.trigger value="document">Document</tabs.trigger>
			</tabs.list>
			<tabs.content value="camera">
				<CameraPanel />
			</tabs.content>
			<tabs.content value="document">
				<DocumentPanel />
			</tabs.content>
		</tabs.root>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`. So I made the flip button a toggle: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I'm assuming `onChange` fires on every press.
- The shutter is a plain `<button onClick>` because the sheet gives `base.button` no press callback.
- I'm assuming `tabs.*`, `native.*` and `base.*` can be used as dotted JSX tags (`<tabs.root>`), as the sheet's comment `<native.camera el={cam} />` suggests.
- I'm assuming a `<style>` element with a template string is an acceptable way to add the stylesheet. The guidance doesn't say where styles go.
- I'm assuming the camera fields (`facing`, `ready`, `access`) are reactive when read in markup and in `pressed`, since the sheet says they are "live".
- I'm assuming the camera keeps running while the Camera tab is hidden, because the panel stays in the page.
- I'm assuming an `async` handler that writes to state with `await` is allowed.
- The page count starts at 0 until `onLoad` runs, so the label briefly reads "Page 1 of 0".
- I'm assuming `width` and `height` on `native.*` are controlled only through `class`.

## Website
- Camera preview: the browser's own live camera picture, after the browser's camera permission prompt, stretched to the panel's width.
- PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, at the panel's width.

Tools used: none
