// Extract every MARKLESS_* diagnostic code from package sources and render the
// docs catalogue the site serves at /errors/<CODE>.
//
// Source of truth is the code itself: the `code` unions in the compiler's
// artifacts, the code literals at each emit site, and each builder's own
// title/message text. Nothing here is hand-written prose; a code whose builder
// carries no text lands in the table with a TODO cell so the gap stays visible.
//
// Usage:
//   node scripts/diagnostics-catalogue.mjs           write the catalogue + pages
//   node scripts/diagnostics-catalogue.mjs --check   fail on any drift
//   node scripts/diagnostics-catalogue.mjs --table   print the table to stdout
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const repoRoot = resolve(import.meta.dirname, '..');
const tablePath = join(repoRoot, 'docs', 'errors-catalogue.md');
const pagesDir = join(repoRoot, 'docs', 'pages', 'errors');
const scriptName = 'scripts/diagnostics-catalogue.mjs';

const CODE_PATTERN = /^MARKLESS_[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const DOCS_URL_PATTERN = /^https:\/\/markless\.dev\/errors\/(MARKLESS_[A-Z0-9_]+)$/;
const CODE_PREFIXED_MESSAGE_PATTERN = /^(MARKLESS_[A-Z0-9_]+):/;
// A code union is declared on a `*Diagnostic` type; the emit sites carry the text.
const DIAGNOSTIC_TYPE_PATTERN = /Diagnostic$/;
const BUILDER_CALLEE_PATTERN = /(?:Error|Diagnostic|diagnostic|error)$/;
const HOLE = '…';

const args = process.argv.slice(2);
const unknownArg = args.find((arg) => !['--check', '--table'].includes(arg));
if (unknownArg) {
	console.error(`usage: node ${scriptName} [--check] [--table]`);
	process.exit(1);
}
const checkOnly = args.includes('--check');
const printTable = args.includes('--table');

// ---------------------------------------------------------------- collection

function sourceRoots() {
	const packagesDir = join(repoRoot, 'packages');
	const roots = [];
	for (const name of readdirSync(packagesDir).toSorted()) {
		const direct = join(packagesDir, name, 'src');
		if (existsSync(direct)) {
			roots.push(direct);
			continue;
		}
		const nested = join(packagesDir, name);
		if (!statSync(nested).isDirectory()) continue;
		for (const child of readdirSync(nested).toSorted()) {
			const childSrc = join(nested, child, 'src');
			if (existsSync(childSrc)) roots.push(childSrc);
		}
	}
	return roots;
}

function collectSourceFiles(dir, files) {
	for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	)) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'dist') continue;
			collectSourceFiles(path, files);
			continue;
		}
		if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
			files.push(path);
	}
	return files;
}

// -------------------------------------------------------------- ast helpers

function walk(node, visit) {
	visit(node);
	ts.forEachChild(node, (child) => walk(child, visit));
}

function memberName(node) {
	if (!node) return undefined;
	if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
	return undefined;
}

// Module-level `const X = 'MARKLESS_…'` bindings of the file being read, so a
// code referenced through a constant still resolves to its literal.
let fileConstants = new Map();

function literalText(node) {
	if (!node) return undefined;
	if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
		return literalText(node.expression);
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isIdentifier(node)) return fileConstants.get(node.text);
	if (ts.isTemplateExpression(node)) {
		let text = node.head.text;
		for (const span of node.templateSpans)
			text += (literalText(span.expression) ?? HOLE) + span.literal.text;
		return text;
	}
	return undefined;
}

// Builder text is often written as a ternary or a `??` chain; each branch is a
// real wording the code can emit, so all of them belong in the catalogue.
function literalAlternatives(node) {
	if (!node) return [];
	if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
		return literalAlternatives(node.expression);
	if (ts.isConditionalExpression(node))
		return [...literalAlternatives(node.whenTrue), ...literalAlternatives(node.whenFalse)];
	if (
		ts.isBinaryExpression(node) &&
		[ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
			node.operatorToken.kind,
		)
	)
		return [...literalAlternatives(node.left), ...literalAlternatives(node.right)];
	const text = literalText(node);
	return text === undefined ? [] : [text];
}

// A cell of nothing but interpolation holes carries no builder text at all.
function hasStaticText(text) {
	return typeof text === 'string' && /[A-Za-z0-9]/.test(text.split(HOLE).join(' '));
}

function staticOrUndefined(text) {
	return hasStaticText(text) ? text : undefined;
}

function propertyValue(objectLiteral, name) {
	for (const property of objectLiteral.properties)
		if (ts.isPropertyAssignment(property) && memberName(property.name) === name)
			return property.initializer;
	return undefined;
}

function literalTypeStrings(typeNode, into) {
	if (!typeNode) return into;
	if (ts.isUnionTypeNode(typeNode)) {
		for (const member of typeNode.types) literalTypeStrings(member, into);
		return into;
	}
	if (ts.isParenthesizedTypeNode(typeNode)) return literalTypeStrings(typeNode.type, into);
	if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal))
		into.push(typeNode.literal.text);
	return into;
}

function kebab(name) {
	return name
		.replace(DIAGNOSTIC_TYPE_PATTERN, '')
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase();
}

// ------------------------------------------------------------- site records

const sites = [];
const unionCodes = new Map();

function packageOf(relativePath) {
	const segments = relativePath.split('/');
	return segments[0] === 'packages' ? segments.slice(1, 2).join('') : segments[0];
}

function passOf(relativePath, phase) {
	const compilerPass = relativePath.match(/^packages\/compiler\/src\/passes\/([^/.]+)/);
	if (compilerPass) return compilerPass[1];
	if (phase) return phase;
	const withinSource = relativePath.replace(/^.*\/src\//, '').replace(/\.tsx?$/, '');
	const segments = withinSource.split('/');
	return segments.length > 1 ? segments[0] : withinSource;
}

function withoutCodePrefix(message, code) {
	if (typeof message !== 'string') return message;
	const prefix = `${code}:`;
	return message.startsWith(prefix) ? message.slice(prefix.length).trim() : message;
}

function addSite(code, file, node, fields) {
	if (!CODE_PATTERN.test(code)) return;
	const relativePath = relative(repoRoot, file).split('\\').join('/');
	const line =
		node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile()))
			.line + 1;
	sites.push({
		code,
		file: relativePath,
		line,
		package: packageOf(relativePath),
		pass: passOf(relativePath, fields.phase),
		severity: fields.severity,
		title: staticOrUndefined(fields.title),
		message: staticOrUndefined(withoutCodePrefix(fields.message, code)),
		why: staticOrUndefined(fields.why),
	});
}

// name -> codes, for builders shaped `function xDiagnostic(input) { return { code: … } }`.
const builderCodes = new Map();

function enclosingBuilderName(node) {
	let scope = node.parent;
	while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
	if (!scope) return undefined;
	if (ts.isFunctionDeclaration(scope)) return memberName(scope.name);
	const declaration = scope.parent;
	return declaration && ts.isVariableDeclaration(declaration)
		? memberName(declaration.name)
		: undefined;
}

function readObjectLiteral(objectLiteral, file) {
	const code = literalText(propertyValue(objectLiteral, 'code'));
	if (!code || !CODE_PATTERN.test(code)) return;
	const builderName = enclosingBuilderName(objectLiteral);
	if (builderName) {
		const codes = builderCodes.get(builderName) ?? new Set();
		codes.add(code);
		builderCodes.set(builderName, codes);
	}
	addTextSites(code, file, objectLiteral, {
		phase: literalText(propertyValue(objectLiteral, 'phase')),
		severity: literalText(propertyValue(objectLiteral, 'severity')),
		titles: literalAlternatives(propertyValue(objectLiteral, 'title')),
		messages: literalAlternatives(propertyValue(objectLiteral, 'message')),
		whys: literalAlternatives(propertyValue(objectLiteral, 'why')),
	});
}

function addTextSites(code, file, node, fields) {
	const count = Math.max(1, fields.titles.length, fields.messages.length, fields.whys.length);
	for (let index = 0; index < count; index += 1)
		addSite(code, file, node, {
			phase: fields.phase,
			severity: fields.severity,
			title: fields.titles[index] ?? fields.titles[0],
			message: fields.messages[index] ?? fields.messages[0],
			why: fields.whys[index] ?? fields.whys[0],
		});
}

// `const code = 'MARKLESS_X'` followed by `new Error(`${code}: …`)` is the
// runtime idiom; the message template's static parts are the only text there.
function readCodeVariable(declaration, file) {
	if (memberName(declaration.name) !== 'code') return;
	const code = literalText(declaration.initializer);
	if (!code || !CODE_PATTERN.test(code)) return;
	let message;
	let scope = declaration.parent;
	while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
	if (scope)
		walk(scope, (node) => {
			if (message !== undefined) return;
			if (!ts.isNewExpression(node) || memberName(node.expression) !== 'Error') return;
			const text = literalText(node.arguments?.[0]);
			if (text !== undefined) message = text.replace(/^…:\s*/, '');
		});
	addSite(code, file, declaration, { message });
}

function readCodePrefixedThrow(node, file) {
	const text = literalText(node);
	if (!text) return;
	const match = text.match(CODE_PREFIXED_MESSAGE_PATTERN);
	if (!match) return;
	addSite(match[1], file, node, { message: text.slice(match[0].length).trim() });
}

function readBuilderCall(node, file) {
	const callee = ts.isPropertyAccessExpression(node.expression)
		? memberName(node.expression.name)
		: memberName(node.expression);
	if (!callee || !BUILDER_CALLEE_PATTERN.test(callee)) return;
	const first = node.arguments?.[0];
	if (!first || !ts.isStringLiteral(first) || !CODE_PATTERN.test(first.text)) return;
	// A later argument that reads as a sentence is the wording this call emits;
	// a bare token argument is a label the builder uses for something else.
	const message = node.arguments
		.slice(1)
		.map((argument) => literalText(argument))
		.findLast((text) => hasStaticText(text) && /\s/.test(text));
	addSite(first.text, file, node, { message });
}

function readCodeProperty(node, file) {
	if (memberName(node.name) !== 'code') return;
	const declared = literalText(node.initializer);
	if (declared && CODE_PATTERN.test(declared)) addSite(declared, file, node, {});
	for (const literal of literalTypeStrings(node.type, []))
		if (CODE_PATTERN.test(literal)) recordUnionCode(literal, node, file);
}

function recordUnionCode(code, node, file) {
	let owner = node.parent;
	while (owner && !ts.isTypeAliasDeclaration(owner) && !ts.isInterfaceDeclaration(owner))
		owner = owner.parent;
	const ownerName = owner ? memberName(owner.name) : undefined;
	const existing = unionCodes.get(code) ?? { code, unions: new Set(), files: new Set() };
	if (ownerName) existing.unions.add(kebab(ownerName));
	existing.files.add(relative(repoRoot, file).split('\\').join('/'));
	unionCodes.set(code, existing);
}

function readDocsUrl(node, file) {
	const text = literalText(node);
	const match = text?.match(DOCS_URL_PATTERN);
	if (match) addSite(match[1], file, node, {});
}

// Text a builder leaves to its caller (`message: input.message`) is only static
// at the call site, so a second pass reads the argument objects of every call
// to a builder whose returned code is unambiguous.
function readBuilderArgument(node, file) {
	const callee = ts.isPropertyAccessExpression(node.expression)
		? memberName(node.expression.name)
		: memberName(node.expression);
	const codes = callee ? builderCodes.get(callee) : undefined;
	if (!codes || codes.size !== 1) return;
	const argument = node.arguments?.[0];
	if (!argument || !ts.isObjectLiteralExpression(argument)) return;
	const title = literalText(propertyValue(argument, 'title'));
	const message = literalText(propertyValue(argument, 'message'));
	const why = literalText(propertyValue(argument, 'why'));
	if (!hasStaticText(title) && !hasStaticText(message) && !hasStaticText(why)) return;
	addSite([...codes][0], file, node, { title, message, why });
}

function readFileConstants(source) {
	const constants = new Map();
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			const name = memberName(declaration.name);
			const value = declaration.initializer;
			if (!name || !value) continue;
			if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
				constants.set(name, value.text);
			else if (ts.isAsExpression(value) && ts.isStringLiteral(value.expression))
				constants.set(name, value.expression.text);
		}
	}
	return constants;
}

const files = sourceRoots().flatMap((root) => collectSourceFiles(root, []));
const parsed = files.map((file) => ({
	file,
	source: ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	),
}));

for (const { file, source } of parsed) {
	fileConstants = readFileConstants(source);
	walk(source, (node) => {
		if (ts.isObjectLiteralExpression(node)) readObjectLiteral(node, file);
		else if (ts.isVariableDeclaration(node)) readCodeVariable(node, file);
		else if (ts.isCallExpression(node)) readBuilderCall(node, file);
		else if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))
			readCodeProperty(node, file);
		if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node) ||
			ts.isTemplateExpression(node)
		) {
			readDocsUrl(node, file);
			readCodePrefixedThrow(node, file);
		}
	});
}

for (const { file, source } of parsed) {
	fileConstants = readFileConstants(source);
	walk(source, (node) => {
		if (ts.isCallExpression(node)) readBuilderArgument(node, file);
	});
}

// ----------------------------------------------------------------- catalogue

function compare(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values) {
	return [...new Set(values.filter(Boolean))].toSorted(compare);
}

function buildEntries() {
	const byCode = new Map();
	for (const site of sites.toSorted(
		(left, right) => compare(left.file, right.file) || left.line - right.line,
	)) {
		const entry = byCode.get(site.code) ?? { code: site.code, sites: [] };
		entry.sites.push(site);
		byCode.set(site.code, entry);
	}
	for (const [code, union] of unionCodes) {
		const entry = byCode.get(code) ?? { code, sites: [] };
		entry.union = {
			unions: [...union.unions].toSorted(compare),
			files: [...union.files].toSorted(compare),
		};
		byCode.set(code, entry);
	}
	return [...byCode.values()].toSorted((left, right) => compare(left.code, right.code));
}

const entries = buildEntries();

function titlesOf(entry) {
	return uniqueSorted(entry.sites.map((site) => site.title));
}

function messagesOf(entry) {
	return uniqueSorted(entry.sites.map((site) => site.message));
}

function packagesOf(entry) {
	const fromSites = entry.sites.map((site) => site.package);
	const fromUnion = (entry.union?.files ?? []).map((file) => packageOf(file));
	return uniqueSorted([...fromSites, ...fromUnion]);
}

function passesOf(entry) {
	return uniqueSorted([...entry.sites.map((site) => site.pass), ...(entry.union?.unions ?? [])]);
}

function cell(text) {
	return text.split('|').join('\\|').replace(/\s+/g, ' ').trim();
}

function tableRow(entry, escape) {
	const titles = titlesOf(entry);
	const messages = messagesOf(entry);
	const title = titles.length > 0 ? escape(cell(titles.join('; '))) : 'TODO: no builder title';
	const message =
		messages.length > 0
			? escape(cell(messages[0])) +
				(messages.length > 1 ? ` (+${messages.length - 1} more)` : '')
			: 'TODO: no builder message';
	return `| \`${entry.code}\` | ${packagesOf(entry).join(', ')} | ${passesOf(entry).join(', ')} | ${title} | ${message} |`;
}

function renderTable(escape = (text) => text) {
	return [
		'| Code | Package | Pass / phase | Title | Message |',
		'| --- | --- | --- | --- | --- |',
		...entries.map((entry) => tableRow(entry, escape)),
	].join('\n');
}

function renderTableFile() {
	return [
		'# Markless diagnostics catalogue',
		'',
		`Generated from package sources by \`${scriptName}\`. Do not edit by hand.`,
		'',
		`${entries.length} codes. Each one is served at \`https://markless.dev/errors/<CODE>\`.`,
		'',
		renderTable(),
		'',
	].join('\n');
}

// MDX parses `{`, `}` and `<` as expression/JSX syntax, so builder text has to
// arrive escaped or a single diagnostic message breaks the docs build. Code
// spans are already inert there, and escaping inside one would show the
// backslashes, so only the prose between them is escaped.
function mdx(text) {
	return text
		.split(/(`[^`]*`)/)
		.map((segment) =>
			segment.startsWith('`')
				? segment
				: segment.split('\\').join('\\\\').replace(/[{}<>]/g, (character) => `\\${character}`),
		)
		.join('');
}

function renderCodePage(entry) {
	const titles = titlesOf(entry);
	const messages = messagesOf(entry);
	const whys = uniqueSorted(entry.sites.map((site) => site.why));
	const severities = uniqueSorted(entry.sites.map((site) => site.severity));
	const lines = [`# ${entry.code}`, ''];
	lines.push(
		titles.length > 0 ? mdx(titles.join('; ')) : 'TODO: this code has no builder title in source.',
		'',
	);
	lines.push(`- Package: ${packagesOf(entry).join(', ')}`);
	lines.push(`- Pass or phase: ${passesOf(entry).join(', ')}`);
	if (severities.length > 0) lines.push(`- Severity: ${severities.join(', ')}`);
	lines.push('');
	lines.push('## Message', '');
	if (messages.length > 0) for (const message of messages) lines.push(mdx(message), '');
	else lines.push('TODO: this code has no builder message in source.', '');
	if (whys.length > 0) {
		lines.push('## Why', '');
		for (const why of whys) lines.push(mdx(why), '');
	}
	lines.push('## Emitted from', '');
	const emitters = uniqueSorted([
		...entry.sites.map((site) => site.file),
		...(entry.union?.files ?? []),
	]);
	for (const emitter of emitters) lines.push(`- \`${emitter}\``);
	lines.push('', `Generated from package sources by \`${scriptName}\`. Do not edit by hand.`, '');
	return lines.join('\n');
}

function renderIndexPage() {
	return [
		'# Markless error codes',
		'',
		`Generated from package sources by \`${scriptName}\`. Do not edit by hand.`,
		'',
		`${entries.length} codes.`,
		'',
		renderTable(mdx),
		'',
	].join('\n');
}

function desiredFiles() {
	const wanted = new Map();
	wanted.set(tablePath, renderTableFile());
	wanted.set(join(pagesDir, 'index.mdx'), renderIndexPage());
	for (const entry of entries)
		wanted.set(join(pagesDir, `${entry.code}.mdx`), renderCodePage(entry));
	return wanted;
}

function existingCataloguePages() {
	if (!existsSync(pagesDir)) return [];
	return readdirSync(pagesDir)
		.filter((name) => name.endsWith('.mdx'))
		.map((name) => join(pagesDir, name))
		.toSorted(compare);
}

// --------------------------------------------------------------------- main

const wanted = desiredFiles();

if (printTable) console.log(renderTable());

if (checkOnly) {
	const drift = [];
	for (const [path, contents] of wanted) {
		const shown = relative(repoRoot, path);
		if (!existsSync(path)) drift.push(`missing: ${shown}`);
		else if (readFileSync(path, 'utf8') !== contents) drift.push(`stale: ${shown}`);
	}
	for (const path of existingCataloguePages())
		if (!wanted.has(path)) drift.push(`orphaned: ${relative(repoRoot, path)}`);
	if (drift.length > 0) {
		console.error('diagnostics catalogue is out of sync with source:');
		for (const line of drift.toSorted(compare)) console.error(`  ${line}`);
		console.error(`Run \`node ${scriptName}\` to regenerate.`);
		process.exit(1);
	}
	console.log(`diagnostics catalogue: ${entries.length} codes, in sync.`);
} else {
	for (const path of existingCataloguePages()) if (!wanted.has(path)) rmSync(path);
	for (const [path, contents] of wanted) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, contents, 'utf8');
	}
	console.log(`diagnostics catalogue: wrote ${wanted.size} files for ${entries.length} codes.`);
}

const perPackage = new Map();
for (const entry of entries)
	for (const name of packagesOf(entry)) perPackage.set(name, (perPackage.get(name) ?? 0) + 1);
const untitled = entries.filter((entry) => titlesOf(entry).length === 0);
console.log(`codes per package: ${[...perPackage]
	.toSorted((left, right) => compare(left[0], right[0]))
	.map(([name, count]) => `${name}=${count}`)
	.join(' ')}`);
console.log(`codes without a builder title: ${untitled.length}`);
