import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MARKLESS_PENDING_REFRESH_STALL_MS } from '@markless/web/fns/pending-timing';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CONSTRUCT_DOCS, HANDLER_DOC, IDENTIFIER_DOCS, docForToken } from './tsrx-docs.ts';

const repo = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

// Every identifier with a hover names one of these real things, and the test checks each one exists.
const PACKAGE_EXPORTS: Readonly<Record<string, string>> = {
	state: 'packages/core/src/index.ts',
	computed: 'packages/core/src/index.ts',
	shared: 'packages/core/src/index.ts',
	storage: 'packages/core/src/index.ts',
	element: 'packages/core/src/index.ts',
	Html: 'packages/router/src/index.ts',
	Link: 'packages/router/src/index.ts',
	PageProps: 'packages/router/src/index.ts',
};
const ELEMENT_ATTRIBUTES = ['el', 'attach'];
const MARKLESS_EVENTS: Readonly<Record<string, string>> = { onVisible: 'visible', onIdle: 'idle' };
const AUTHORED_NAMES = ['style', 'children'];

function exportsOf(entry: string): Set<string> {
	const file = fileURLToPath(new URL(entry, repo));
	const program = ts.createProgram([file], {
		allowImportingTsExtensions: true,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmit: true,
		skipLibCheck: true,
		target: ts.ScriptTarget.ES2023,
		types: [],
	});
	const checker = program.getTypeChecker();
	const symbol = checker.getSymbolAtLocation(program.getSourceFile(file)!)!;
	return new Set(checker.getExportsOfModule(symbol).map((one) => one.name));
}

const TSRX_TYPES = ts.createSourceFile(
	'markless-tsrx.d.ts',
	read('packages/typescript-plugin/src/markless-tsrx.d.ts'),
	ts.ScriptTarget.Latest,
	true,
);

function membersOfTypeAlias(name: string): Set<string> {
	const names = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
			node.forEachChild(function collect(child: ts.Node): void {
				if (ts.isPropertySignature(child) && ts.isIdentifier(child.name)) names.add(child.name.text);
				child.forEachChild(collect);
			});
		}
		node.forEachChild(visit);
	};
	visit(TSRX_TYPES);
	return names;
}

describe('identifier hovers', () => {
	it('each names a package export, an element attribute, a Markless event or an authored name', () => {
		const classified = [
			...Object.keys(PACKAGE_EXPORTS),
			...ELEMENT_ATTRIBUTES,
			...Object.keys(MARKLESS_EVENTS),
			...AUTHORED_NAMES,
		];
		expect(classified.toSorted()).toEqual(Object.keys(IDENTIFIER_DOCS).toSorted());
	});

	it('names only real exports of @markless/core and @markless/router', () => {
		const byEntry = new Map<string, Set<string>>();
		for (const [name, entry] of Object.entries(PACKAGE_EXPORTS)) {
			if (!byEntry.has(entry)) byEntry.set(entry, exportsOf(entry));
			expect(byEntry.get(entry), `${name} in ${entry}`).toContain(name);
		}
	});

	it('names only attributes every element accepts', () => {
		const attributes = membersOfTypeAlias('MarklessAttributes');
		for (const name of ELEMENT_ATTRIBUTES) expect(attributes).toContain(name);
	});

	it('gives onVisible and onIdle their own docs, since they are Markless events and not DOM ones', () => {
		const events = membersOfTypeAlias('MarklessEventMap');
		for (const [prop, event] of Object.entries(MARKLESS_EVENTS)) {
			expect(events).toContain(event);
			expect(docForToken(prop)).not.toBe(HANDLER_DOC);
		}
		expect(docForToken('onClick')).toBe(HANDLER_DOC);
	});

	it('says children cannot be looked inside, which the compiler enforces as an error', () => {
		expect(exportsOf('packages/core/src/index.ts')).toContain('Children');
		expect(read('packages/compiler/src/passes/public-render/diagnostics.ts')).toMatch(
			/code: 'MARKLESS_CHILDREN_OPAQUE',\s+severity: 'error'/,
		);
		expect(IDENTIFIER_DOCS.children!.doc).toContain('stops the build');
	});

	it('scopes a style block to its file, not its component', () => {
		expect(IDENTIFIER_DOCS.style!.doc).toContain('file');
		expect(IDENTIFIER_DOCS.style!.doc).not.toMatch(/to that component/);
	});
});

describe('construct hovers', () => {
	it('calls @{ } a block of instructions, not a component body', () => {
		expect(CONSTRUCT_DOCS['@{']!.kind).toBe('Instructions');
		expect(CONSTRUCT_DOCS['@{']!.doc).toMatch(/top to bottom/);
	});

	it('states the refresh stall from the runtime constant', () => {
		expect(CONSTRUCT_DOCS['@pending']!.doc).toContain(
			`${MARKLESS_PENDING_REFRESH_STALL_MS / 1000} seconds`,
		);
	});

	it('says every @for needs a key, which the compiler enforces as an error', () => {
		expect(read('packages/compiler/src/passes/semantic-graph/diagnostics.ts')).toMatch(
			/code: 'MARKLESS_REPEAT_KEY_REQUIRED',\s+severity: 'error'/,
		);
		expect(CONSTRUCT_DOCS['@for']!.doc).toMatch(/needs a key/);
		expect(CONSTRUCT_DOCS['@for']!.doc).not.toMatch(/optional/);
	});

	it('never uses hydration wording', () => {
		const all = [...Object.values(CONSTRUCT_DOCS), ...Object.values(IDENTIFIER_DOCS), HANDLER_DOC];
		for (const doc of all) expect(`${doc.kind} ${doc.doc}`).not.toMatch(/hydrat|\bslots?\b/i);
	});
});
