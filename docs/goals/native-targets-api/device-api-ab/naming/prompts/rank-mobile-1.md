You are taking part in a study of API naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Answer as a developer who builds phone apps for iPhone and Android. Use the words you would naturally use.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

Below are six versions of the same Markless page. They differ only in the name of the namespace used for the sheet, the camera preview and the PDF view (and in its import line). In every version that namespace means the same thing. You have no documentation for any package.

### Version 1

```tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { os } from '@markless/os';
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
				<os.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<os.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<os.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</os.sheet>

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

### Version 2

```tsrx
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

### Version 3

```tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { host } from '@markless/host';
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
				<host.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<host.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<host.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</host.sheet>

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

### Version 4

```tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { builtin } from '@markless/builtin';
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
				<builtin.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<builtin.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<builtin.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</builtin.sheet>

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

### Version 5

```tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { android } from '@markless/android';
import { ios } from '@markless/ios';
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
				<ios.camera el={cam} />
				<android.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<>
						<ios.pdf src={`/statements/${shown}`} />
						<android.pdf src={`/statements/${shown}`} />
					</>
				}
			</tabs.content>
		</tabs.root>

		<ios.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</ios.sheet>
		<android.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</android.sheet>

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

### Version 6

```tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { native } from '@markless/native';
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
				<native.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<native.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<native.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</native.sheet>

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

A. Rank all six versions from clearest to least clear: in which is it easiest to tell, from the code alone, who draws the sheet, the camera preview and the PDF view, and what a visitor to the website gets? Write the ranking as version numbers, clearest first, on one line: `Ranking: 3, 1, …`.
B. One line each: why your first choice is clearest, and why your last is least clear.
C. Which namespace name would you rather write in your own code, and why (one line)?

Output format, exactly: `Ranking: …`, then lines `B:` and `C:`, then `Tools used: none`.
