You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks.

The app is built from one codebase as an iPhone app, an Android app and a website. `@markless/device` is a package of device features and `@markless/ui` a package of components. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer, native } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<native.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<native.sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</native.sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END CODE ===

Questions:
1. Where does each tag come from: HTML, Markless itself, or a package (which)? Answer for the tag that shows the camera, the Filters sheet tag, the `drawer` tags, `base.button`, `button` and `img`.
2. Do the camera tag and the Filters sheet exist in the website build? What does a website visitor get for each?
3. Who decides how each of these looks, the page's author or the system: the camera preview, the Filters sheet, the Comments drawer?
4. How is the Filters sheet different from the Comments drawer?
5. To change the heading "Choose a filter", how many places in this file must change? Name them.
6. What does each use of `platform` in this file mean? Who sees the note "Photos also save to your library": someone in the iPhone app, someone visiting the website in Safari on an iPhone, or both?
7. How sure are you of your answers to questions 2 and 6 (1–5)? What would you need to know to be sure?

Output format: lines `1:` … `7:`; end with `Tools used: none`.
