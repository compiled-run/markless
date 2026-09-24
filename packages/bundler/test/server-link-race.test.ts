import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { marklessServer } from '../src/rolldown.ts';

// The child starts compiling first and stalls on its own import, so the parent
// reaches the child's claims while the child is mid-link. The parent must wait
// for the child's final publication instead of linking an empty claim set.
test(
	'a server parent links the prop-bound claims of a child that is still compiling',
	{ timeout: 120_000 },
	async () => {
		const directory = await realpath(
			await mkdtemp(join(tmpdir(), 'markless-server-link-race-')),
		);
		const page = join(directory, 'Page.tsrx');
		const button = join(directory, 'Button.tsrx');
		const icon = join(directory, 'Icon.tsrx');
		await writeFile(
			join(directory, 'entry.js'),
			`export { Button } from './Button.tsrx';\nexport { Page } from './Page.tsrx';\n`,
		);
		await writeFile(icon, `export function Icon() @{ <i>*</i> }\n`);
		await writeFile(
			button,
			`import { Icon } from './Icon.tsrx';
export function Button({ label, onPress }) @{
	<button onClick={() => { onPress(label); }}><Icon />{label}</button>
}
`,
		);
		await writeFile(
			page,
			`import { state } from '@markless/core';
import { Button } from './Button.tsrx';
export function Page() @{
	let pressed = state('none');
	<main>
		<Button label="Go" onPress={(value) => pressed = value} />
		<output>{pressed}</output>
	</main>
}
`,
		);
		let releaseIcon!: () => void;
		const iconReleased = new Promise<void>((resolve) => (releaseIcon = resolve));
		let pageLinked = false;
		const server = marklessServer({ rootDir: directory });
		const transform = server.transform as (
			this: unknown,
			...args: unknown[]
		) => Promise<unknown>;
		let pageRows: ReadonlyArray<{ readonly baseSymbolId: string }> = [];
		server.transform = async function (this: unknown, ...args: unknown[]) {
			const result = (await transform.apply(this, args)) as {
				manifest?: { captureMetadata?: { boundResolverRows?: typeof pageRows } };
			} | null;
			if (args[1] === page)
				pageRows = result?.manifest?.captureMetadata?.boundResolverRows ?? [];
			return result;
		} as typeof server.transform;
		const build = await rolldown({
			input: join(directory, 'entry.js'),
			external: [/^@markless\//],
			plugins: [
				{
					name: 'stall-grandchild',
					async load(id) {
						if (id === icon) await iconReleased;
						return null;
					},
					transform: {
						order: 'post',
						handler(_code, id) {
							if (id === page) pageLinked = true;
							return null;
						},
					},
				},
				server,
				{
					name: 'release-grandchild',
					async buildStart() {
						const release = async () => {
							for (let turn = 0; turn < 200 && !pageLinked; turn += 1) {
								await new Promise((resolve) => setTimeout(resolve, 10));
							}
							releaseIcon();
						};
						void release();
					},
				},
			],
		});
		try {
			await build.generate({ format: 'es' });
			expect(pageRows.map((row) => row.baseSymbolId)).toEqual([
				expect.stringMatching(
					new RegExp(`^imported:${encodeURIComponent(button)}:symbol:`),
				),
			]);
		} finally {
			releaseIcon();
			await build.close();
			await rm(directory, { recursive: true, force: true });
		}
	},
);
