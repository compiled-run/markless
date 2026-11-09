import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// head and the metadata inside it are never rendered, so a scoped selector can
// never style them: the scope class is noise there, on every served page.

const DOCUMENT = `export default function Document({ url, children }) @{
	const theme = url?.pathname === '/' ? 'light' : undefined;
	<html lang="en" class={theme}>
		<head>
			<meta charset="utf-8" />
			<title>{url?.pathname}</title>
			<link rel="stylesheet" href="/site.css" class={theme} />
			<script src="/boot.js"></script>
			<base href="/" />
		</head>
		<body>
			<style>
				.shell { padding: 1rem; }
			</style>
			<main class="shell">{children}</main>
		</body>
	</html>;
}`;

const DOCUMENT_ALTERNATE = `export function Frame({ slot, mode }) @{
	<html data-mode={mode}>
		<head class={mode}>
			<link rel="icon" href="/i.svg" />
			<meta name="viewport" content="width=device-width" class="vp" />
			<script type="module">{'void 0'}</script>
			<title>Frame</title>
		</head>
		<body class="frame">
			<section>{slot}</section>
			<style>
				section { margin: 0; }
			</style>
		</body>
	</html>;
}`;

const METADATA = ['head', 'meta', 'title', 'link', 'script', 'base'];

async function compile(source: string, filename: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	const scope = result.publicRenderPlan.styleScopes[0]?.scopeId;
	expect(scope).toMatch(/^mk-/);
	const statics = result.renderData.chunks.map((chunk) => chunk.statics.join('§')).join('\n');
	return { result, scope: scope!, statics };
}

function openTags(statics: string, tag: string): string[] {
	return statics.match(new RegExp(`<${tag}(?=[\\s>§])[^>]*>`, 'g')) ?? [];
}

for (const [label, source, filename] of [
	['document', DOCUMENT, '/app/document.tsrx'],
	['alternate document', DOCUMENT_ALTERNATE, '/app/frame.tsrx'],
] as const) {
	test(`${label}: head and its metadata never carry the scope class`, async () => {
		const { result, scope, statics } = await compile(source, filename);
		for (const tag of METADATA)
			for (const open of openTags(statics, tag)) expect(open).not.toContain(scope);
		expect(openTags(statics, 'head')).toHaveLength(1);
		expect(openTags(statics, 'body')[0]).toContain(scope);
		expect(openTags(statics, 'html')[0]).toContain(scope);

		const metadataHosts = new Set(
			result.semanticGraph.hostNodes
				.filter((host) => METADATA.includes(host.tagName))
				.map((host) => host.id),
		);
		const metadataClassTargets = result.semanticGraph.templateReads.filter(
			(read) => metadataHosts.has(read.hostNodeId ?? '') && read.target?.kind === 'class',
		);
		expect(metadataClassTargets.length).toBeGreaterThan(0);
		for (const read of metadataClassTargets) expect(read.target).toEqual({ kind: 'class' });
	});
}
