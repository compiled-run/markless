// usage: node check/make-cold.mjs <candidate>[:<inner>]...   (run from package-name/; inner defaults to base)
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './common.mjs';

export function page(name, inner = 'base') {
	return `import { state } from '@markless/core';
import { camera, native } from '@markless/device';
import { modal, tabs, ${inner} } from '@markless/${name}';

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
				<${inner}.label for="name">Name</${inner}.label>
				<input id="name" />
				<${inner}.separator />
				<${inner}.button onClick={() => (confirmOpen = true)}>Delete account</${inner}.button>
			</tabs.content>
			<tabs.content value="photo">
				<${inner}.button onClick={() => (photoOpen = true)}>Change photo</${inner}.button>
			</tabs.content>
		</tabs.root>

		<modal.root open={confirmOpen} onChange={(open) => (confirmOpen = open)}>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete your account?</modal.title>
					<${inner}.button onClick={() => (confirmOpen = false)}>Delete</${inner}.button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<native.sheet open={photoOpen} onChange={(open) => (photoOpen = open)}>
			<native.camera el={cam} />
			<${inner}.button onClick={() => cam.takePhoto()}>Take photo</${inner}.button>
		</native.sheet>
	</main>
}
`;
}

const cold = (name, inner, persona) => `${HEAD}

${PERSONA[persona]}

${CONTEXT}

Here is one page from a Markless app. You have no documentation for any of the packages it imports.

\`\`\`tsrx
// file: Account.tsrx
${page(name, inner).trimEnd()}
\`\`\`

Answer each question in two to four sentences. If you are unsure, give your best reading and say how sure you are.

1. What is in \`@markless/${name}\`?
2. Do its pieces come styled, or not? What would \`<tabs.trigger>\` look like with no CSS of your own?
3. Do its pieces work in the iPhone app and the Android app, or only on the website?
4. You need a date picker. Where would you look for one?
5. How are the pieces from \`@markless/${name}\` different from \`native.sheet\` and \`native.camera\`?
6. ${name === 'ui' ? 'What would you expect a second package named `@markless/components` to be if it existed beside this one?' : 'What would you expect a package named `@markless/ui` to be if it existed beside this one?'}
7. What is \`${inner}\`, as in \`<${inner}.button>\`?

Output format, exactly: lines starting \`1:\` to \`7:\`, then a line \`Confidence: N/5\` (how sure you are of your answers overall), then \`Tools used: none\`.
`;

for (const arg of process.argv.slice(2)) {
	const [name, inner = 'base'] = arg.split(':');
	const id = inner === 'base' ? name : `${name}-${inner}`;
	writeFileSync(`cold/pages/${id}.tsrx`, page(name, inner));
	for (const p of ['beginner', 'experienced']) writeFileSync(`prompts/cold-${id}-${p}.md`, cold(name, inner, p));
}
