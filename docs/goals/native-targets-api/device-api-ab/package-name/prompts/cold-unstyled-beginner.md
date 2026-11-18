You are taking part in a study of package naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Answer as a web developer about one year into your first job: you have built a few React sites and followed tutorials, and you are still learning the ecosystem. Use the words you would naturally use.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

Here is one page from a Markless app. You have no documentation for any of the packages it imports.

```tsrx
// file: Account.tsrx
import { state } from '@markless/core';
import { camera, native } from '@markless/device';
import { modal, tabs, base } from '@markless/unstyled';

export default function Account() @{
	let tab = state('profile');
	let confirmOpen = state(false);
	let photoOpen = state(false);
	const cam = camera();

	<main>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="profile">Profile</tabs.trigger>
				<tabs.trigger value="photo">Photo</tabs.trigger>
			</tabs.list>
			<tabs.content value="profile">
				<base.label for="name">Name</base.label>
				<input id="name" />
				<base.separator />
				<base.button onClick={() => (confirmOpen = true)}>Delete account</base.button>
			</tabs.content>
			<tabs.content value="photo">
				<base.button onClick={() => (photoOpen = true)}>Change photo</base.button>
			</tabs.content>
		</tabs.root>

		<modal.root open={confirmOpen} onChange={(open) => (confirmOpen = open)}>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete your account?</modal.title>
					<base.button onClick={() => (confirmOpen = false)}>Delete</base.button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<native.sheet open={photoOpen} onChange={(open) => (photoOpen = open)}>
			<native.camera el={cam} />
			<base.button onClick={() => cam.takePhoto()}>Take photo</base.button>
		</native.sheet>
	</main>
}
```

Answer each question in two to four sentences. If you are unsure, give your best reading and say how sure you are.

1. What is in `@markless/unstyled`?
2. Do its pieces come styled, or not? What would `<tabs.trigger>` look like with no CSS of your own?
3. Do its pieces work in the iPhone app and the Android app, or only on the website?
4. You need a date picker. Where would you look for one?
5. How are the pieces from `@markless/unstyled` different from `native.sheet` and `native.camera`?
6. What would you expect a package named `@markless/ui` to be if it existed beside this one?
7. What is `base`, as in `<base.button>`?

Output format, exactly: lines starting `1:` to `7:`, then a line `Confidence: N/5` (how sure you are of your answers overall), then `Tools used: none`.
