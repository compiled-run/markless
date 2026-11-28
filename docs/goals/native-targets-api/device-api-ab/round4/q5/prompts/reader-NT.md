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
		<native.pdf src="/guide.pdf" class="document" />
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
1. Do `native.camera`, `native.sheet` and `native.pdf` exist in the website build? For each, say yes, no or can't tell, and what a website visitor gets.
2. What do you take `native` to mean here? Pick one and explain: (a) the browser's own built-in HTML elements; (b) the phone's own UI, the iPhone or Android control; (c) whatever the platform the app runs on draws itself, the phone's own UI in the apps and the browser's on the website; (d) a design system, the app's own styled component library; (e) something else (say what).
3. Could `native` be read as the name of a design system or component library? Answer yes, no or somewhat, and why.
4. Who decides how the Filters sheet looks, the page's author or the system? And the Comments drawer?
5. How sure are you of your answers to questions 1 and 2 (1–5)?

Output format: lines `1:` … `5:` (start line 2 with the letter you picked); end with `Tools used: none`.
