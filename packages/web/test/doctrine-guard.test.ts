import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const webSourceRoot = resolve(repoRoot, 'packages/web/src');
const doctrine =
	'Components are build-time markup organization; one render model at three execution times.';

// Every sanctioned native scan/read is named with its narrow non-component purpose.
// Exact source keys make additions and semantic changes require a conscious review here.
const RUNTIME_MOUNT_SCAN_ALLOWLIST: Readonly<Record<string, string>> = {
	'packages/web/src/event-only-lean/row.ts :: const text = element?.textContent ?? element?.text ?? element?.innerHTML;':
		'Lean payload decoding accepts innerHTML only as a legacy script-text fallback.',
	'packages/web/src/event-only-lean/scalar-core.ts :: const text = element?.textContent ?? element?.text ?? element?.innerHTML;':
		'Lean scalar payload decoding accepts innerHTML only as a legacy script-text fallback.',
	'packages/web/src/event-resume.ts :: const text = script?.textContent ?? script?.text ?? script?.innerHTML;':
		'Event payload decoding accepts innerHTML only as a legacy script-text fallback.',
	'packages/web/src/fns/dom-order.ts :: const w = document.createTreeWalker(r, 1);':
		'The neutral emitted locator helper walks elements by compiler-recorded DOM order.',
	'packages/web/src/fns/row-component-mint.ts :: if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))':
		"A client-minted row censuses the compiler-emitted branch anchors in the fragment it just built, before the row joins the page.",
	'packages/web/src/fns/settle-plan.ts :: const walker = root.ownerDocument!.createTreeWalker(root, 128);':
		'The settle filler finds the build-emitted hole comments inside one arm template.',
	'packages/web/src/inline/payload-document.ts :: const text = element.textContent ?? element.text ?? element.innerHTML;':
		'Inline payload decoding accepts innerHTML only as a legacy script-text fallback.',
	"packages/web/src/inline/resumer.ts :: const preloaded = currentDocument.querySelectorAll('link[rel=modulepreload]').length;":
		'Debug instrumentation counts module-preload links and does not locate components.',
	"packages/web/src/inline/resumer.ts :: const preloaded = document.querySelectorAll('link[rel=modulepreload]').length;":
		'The prerender log summary counts module-preload links and does not locate components.',
	'packages/web/src/inline/resumer.ts :: const walker = currentDocument.createTreeWalker(root, 1);':
		'The inline resumer materializes compiler-recorded element locators in DOM order.',
	'packages/web/src/inline/resumer.ts :: const walker = document.createTreeWalker(root, 128);':
		'The settle boot censuses the build-emitted boundary comment anchors it fills between.',
	'packages/web/src/payload-document-common.ts :: const text = element.textContent ?? element.text ?? element.innerHTML;':
		'Shared payload decoding accepts innerHTML only as a legacy script-text fallback.',
	'packages/web/src/payload.ts :: const text = element.textContent ?? element.text ?? element.innerHTML;':
		'Payload decoding accepts innerHTML only as a legacy script-text fallback.',
	'packages/web/src/render-to-stream.ts :: const walk = d.createTreeWalker(r, 129);':
		'Stream debug code maps compiler-recorded locators across elements and comments.',
	'packages/web/src/render-to-stream.ts :: const w = d.createTreeWalker(d.body, 128);':
		'The streamed-arm executor finds its compiler-emitted boundary comment anchors.',
	'packages/web/src/resume-arm-records.ts :: if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))':
		'CSR mount maps serialized boundary indexes to compiler-emitted comment anchors before the runtime starts.',
	'packages/web/src/resume-arm-records.ts :: if (within && node.nodeType === 8 && isArmBranchAnchorComment(node as ResumeDomComment)) {':
		'Arm-record adoption censuses compiler-emitted branch anchors within an explicit range.',
	'packages/web/src/resume-async-boundaries.ts :: if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))':
		'Async-boundary adoption maps serialized indexes to compiler-emitted comment anchors.',
	'packages/web/src/resume-branches.ts :: (value as { readonly nodeType?: number }).nodeType === 8':
		'Branch adoption validates that a supplied live anchor is a comment node.',
	'packages/web/src/resume-branches.ts :: if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))':
		'Branch adoption maps serialized indexes to compiler-emitted comment anchors.',
	'packages/web/src/resume-stream-patches.ts :: const query = root.ownerDocument?.querySelectorAll?.bind(root.ownerDocument);':
		'Streamed-patch adoption selects inert patch scripts emitted by the server.',
	'packages/web/src/resume-types.ts :: readonly querySelectorAll?: (selector: string) => Iterable<ResumeDomHostElement>;':
		'The resume host-document surface declares the narrow script-query capability it consumes.',
	'packages/web/src/resume.ts :: const live = start?.nodeType === 8 && end?.nodeType === 8;':
		'Async-boundary adoption validates caller-supplied live comment anchors.',
	'packages/web/src/resume.ts :: if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))':
		'Async-boundary adoption maps serialized indexes to compiler-emitted comment anchors.',
};

type SourceMatch = {
	readonly key: string;
	readonly file: string;
	readonly line: number;
	readonly source: string;
};

describe('runtime mount mechanical doctrine guard', () => {
	test('native parsing never becomes DOM scanning or innerHTML reading', async () => {
		const planted = matchesForSource(
			'self-test/component-mount.ts',
			'const components = root.querySelectorAll("[data-component]");',
		);
		expect(() => assertRuntimeMountScans(planted, {})).toThrow(doctrine);

		const files = await findTypeScriptFiles(webSourceRoot);
		const matches = (
			await Promise.all(
				files.map(async (file) =>
					matchesForSource(relative(repoRoot, file), await readFile(file, 'utf8')),
				),
			)
		).flat();
		assertRuntimeMountScans(matches, RUNTIME_MOUNT_SCAN_ALLOWLIST);
	});
});

function matchesForSource(file: string, source: string): SourceMatch[] {
	return source.split('\n').flatMap((rawLine, index) => {
		const line = rawLine.trim();
		const forbidden =
			/\b(?:querySelectorAll|createTreeWalker|createNodeIterator)\b/.test(line) ||
			/\.nodeType\s*[!=]==?\s*8\b/.test(line) ||
			/\b8\s*[!=]==?\s*[^;]*\.nodeType\b/.test(line) ||
			isInnerHtmlRead(line);
		if (!forbidden) return [];
		return [{ key: `${file} :: ${line}`, file, line: index + 1, source: line }];
	});
}

function isInnerHtmlRead(line: string): boolean {
	for (const match of line.matchAll(/\.innerHTML\b/g)) {
		const after = line.slice((match.index ?? 0) + match[0].length);
		// Assignment is the sanctioned native template parser. Reads and compound
		// assignments remain forbidden because they inspect an existing DOM tree.
		if (!/^\s*=(?!=)/.test(after)) return true;
	}
	return false;
}

function assertRuntimeMountScans(
	matches: readonly SourceMatch[],
	allowlist: Readonly<Record<string, string>>,
): void {
	const actual = new Set(matches.map((match) => match.key));
	const violations = matches
		.filter((match) => !allowlist[match.key])
		.map((match) => `${match.file}:${match.line}: ${match.source}`);
	for (const key of Object.keys(allowlist)) {
		if (!actual.has(key)) violations.push(`stale allowlist entry: ${key}`);
	}
	if (violations.length > 0) {
		throw new Error(
			[
				'DOCTRINE GUARD FAILED: runtime mount paths must not scan the DOM or read innerHTML.',
				doctrine,
				...violations,
				`Allowlist: RUNTIME_MOUNT_SCAN_ALLOWLIST in ${relative(repoRoot, import.meta.filename)}`,
			].join('\n'),
		);
	}
}

async function findTypeScriptFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = resolve(root, entry.name);
			return entry.isDirectory()
				? findTypeScriptFiles(path)
				: Promise.resolve(path.endsWith('.ts') ? [path] : []);
		}),
	);
	return files.flat().sort();
}
