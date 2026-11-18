You are taking part in a study of API naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Answer as a web developer who has built websites and web apps for years and has never built a phone app. Use the words you would naturally use.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

Here is one page from a Markless app. You have no documentation for any of the packages it imports.

```tsrx
// file: Receipts.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { system } from '@markless/system';
import { Filters } from './Filters.tsrx';

export default function Receipts() @{
	let tab = state('scan');
	let filtersOpen = state(false);
	let tipsOpen = state(false);
	let shown = state<string | null>(null);
	const cam = camera();

	<main>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="scan">Scan</tabs.trigger>
				<tabs.trigger value="saved">Saved</tabs.trigger>
			</tabs.list>
			<tabs.content value="scan">
				<system.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<system.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<system.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</system.sheet>

		<drawer.root open={tipsOpen} onChange={(open) => (tipsOpen = open)}>
			<drawer.trigger>Scanning tips</drawer.trigger>
			<drawer.backdrop>
				<drawer.content>
					<drawer.title>Scanning tips</drawer.title>
					<p>Flatten the receipt and fill the frame.</p>
					<drawer.close>Got it</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
```

Answer each question in two to four sentences. If you are unsure, give your best reading and say how sure you are.

1. What is `system`?
2. Where does it come from?
3. Who decides how the filter sheet (`system.sheet`) looks and moves in the iPhone app and in the Android app?
4. What does a visitor to the website get for each of `system.sheet`, `system.camera` and `system.pdf`?
5. How is `system.sheet` different from the `drawer` on the same page?
6. Would you expect `system.button` to exist? Why or why not?

Output format, exactly: lines starting `1:` to `6:`, then a line `Confidence: N/5` (how sure you are of your answers overall), then `Tools used: none`.
