// Scans packages/*/src for MARKLESS_* codes and writes the data behind /errors and /errors/<CODE>.
// Run `node website/tooling/errors.ts` to regenerate; errors.test.ts fails when the data drifts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { guides, type GuideSource } from '../components/docs/errors/guides.ts';
import type {
	CodeLine,
	ErrorData,
	ErrorEntry,
	ErrorGroup,
	ErrorSeverity,
	ErrorStage,
	Segment,
} from '../components/docs/errors/types.ts';

export const REPO_URL = 'https://github.com/compiled-run/markless/blob/main';
export const DOCS_URL = 'https://markless.dev/errors/';
const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = resolve(websiteRoot, '..');
export const dataFile = join(websiteRoot, 'components/docs/errors/errors-data.ts');
export const indexFile = join(websiteRoot, 'components/docs/errors/errors-index.ts');

export type SourceFile = { readonly rel: string; readonly pkg: string; readonly src: string };

type Token = {
	readonly type: 'str' | 'ident' | 'punct' | 'num';
	readonly value: string;
	readonly start: number;
	readonly line: number;
	readonly exprs: readonly string[];
	readonly template?: true;
};

const CODE_RE = /^MARKLESS_[A-Z0-9_]*[A-Z0-9]$/;
const CODE_AT_START = /^(MARKLESS_[A-Z0-9_]*[A-Z0-9])(?=$|[:\s])/;
const REGEX_PREV = new Set([
	'return',
	'typeof',
	'case',
	'do',
	'else',
	'in',
	'of',
	'new',
	'delete',
	'void',
	'throw',
	'yield',
	'await',
]);

function unescape(c: string | undefined): string {
	return ({ n: '\n', t: '\t', r: '', '0': '' } as Record<string, string>)[c ?? ''] ?? c ?? '';
}

function countLines(src: string, from: number, to: number): number {
	let n = 0;
	for (let k = from; k < to; k++) if (src[k] === '\n') n++;
	return n;
}

// The template text with each ${expr} replaced by a \uE000<index>\uE000 marker.
function scanTemplate(src: string, i: number): { value: string; exprs: string[]; end: number } {
	let value = '';
	const exprs: string[] = [];
	i++;
	while (i < src.length && src[i] !== '`') {
		if (src[i] === '\\') {
			value += unescape(src[i + 1]);
			i += 2;
			continue;
		}
		if (src[i] === '$' && src[i + 1] === '{') {
			const exprStart = i + 2;
			const exprEnd = skipBalanced(src, exprStart);
			exprs.push(src.slice(exprStart, exprEnd).trim());
			value += `\uE000${exprs.length - 1}\uE000`;
			i = exprEnd + 1;
			continue;
		}
		value += src[i++];
	}
	return { value, exprs, end: i + 1 };
}

function skipBalanced(src: string, i: number): number {
	let depth = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === "'" || c === '"') {
			i++;
			while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
			i++;
			continue;
		}
		if (c === '`') {
			i = scanTemplate(src, i).end;
			continue;
		}
		if (c === '{') depth++;
		if (c === '}') {
			if (depth === 0) return i;
			depth--;
		}
		i++;
	}
	return i;
}

export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	let line = 1;
	const push = (type: Token['type'], value: string, start: number) =>
		tokens.push({ type, value, start, line, exprs: [] });
	while (i < src.length) {
		const ch = src[i]!;
		if (ch === '\n') {
			line++;
			i++;
			continue;
		}
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === '/' && src[i + 1] === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			continue;
		}
		if (ch === '/' && src[i + 1] === '*') {
			const end = src.indexOf('*/', i + 2);
			const stop = end === -1 ? src.length : end + 2;
			line += countLines(src, i, stop);
			i = stop;
			continue;
		}
		if (ch === "'" || ch === '"') {
			const start = i;
			const startLine = line;
			let value = '';
			i++;
			while (i < src.length && src[i] !== ch) {
				if (src[i] === '\\') {
					value += unescape(src[i + 1]);
					i += 2;
					continue;
				}
				if (src[i] === '\n') break;
				value += src[i++];
			}
			i++;
			tokens.push({ type: 'str', value, start, line: startLine, exprs: [] });
			continue;
		}
		if (ch === '`') {
			const start = i;
			const startLine = line;
			const { value, exprs, end } = scanTemplate(src, i);
			line += countLines(src, i, end);
			i = end;
			tokens.push({ type: 'str', value, start, line: startLine, exprs, template: true });
			for (const expr of exprs)
				for (const inner of tokenize(expr))
					tokens.push({ ...inner, start, line: startLine + inner.line - 1 });
			continue;
		}
		if (ch === '/') {
			const prev = tokens[tokens.length - 1];
			const isRegex =
				!prev ||
				(prev.type === 'punct' && !')]}'.includes(prev.value)) ||
				(prev.type === 'ident' && REGEX_PREV.has(prev.value));
			if (isRegex) {
				i++;
				let cls = false;
				while (i < src.length && src[i] !== '\n') {
					if (src[i] === '\\') {
						i += 2;
						continue;
					}
					if (src[i] === '[') cls = true;
					else if (src[i] === ']') cls = false;
					else if (src[i] === '/' && !cls) break;
					i++;
				}
				i++;
				while (/[a-z]/i.test(src[i] ?? '')) i++;
				continue;
			}
		}
		if (/[A-Za-z_$]/.test(ch)) {
			const start = i;
			while (/[\w$]/.test(src[i] ?? '')) i++;
			push('ident', src.slice(start, i), start);
			continue;
		}
		if (/[0-9]/.test(ch)) {
			while (/[\w.]/.test(src[i] ?? '')) i++;
			push('num', '', i);
			continue;
		}
		if (src.startsWith('...', i)) {
			push('punct', '...', i);
			i += 3;
			continue;
		}
		if (src.startsWith('=>', i)) {
			push('punct', '=>', i);
			i += 2;
			continue;
		}
		if (src.startsWith('?.', i) && !/[0-9]/.test(src[i + 2] ?? '')) {
			push('punct', '?.', i);
			i += 2;
			continue;
		}
		if (/[=!]==?/.test(src.slice(i, i + 2)) && src[i + 1] === '=') {
			const op = src[i + 2] === '=' ? src.slice(i, i + 3) : src.slice(i, i + 2);
			push('punct', op, i);
			i += op.length;
			continue;
		}
		push('punct', ch, i);
		i++;
	}
	return tokens;
}

const SKIP_FILE = /(\.test\.|\.spec\.|\.d\.ts$)/;
const SKIP_DIR = new Set(['node_modules', '__tests__', 'test', 'tests', 'fixtures', 'dist']);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (!SKIP_DIR.has(entry)) walk(full, out);
		} else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry) && !SKIP_FILE.test(entry)) out.push(full);
	}
	return out;
}

/** Every non-test source file under packages/<name>/src, tagged with its package's npm name. */
export function readSourceFiles(root: string = repoRoot): SourceFile[] {
	const packagesDir = join(root, 'packages');
	return readdirSync(packagesDir)
		.sort()
		.filter((name) => existsSync(join(packagesDir, name, 'src')))
		.flatMap((name) => {
			const pkg = (
				JSON.parse(readFileSync(join(packagesDir, name, 'package.json'), 'utf8')) as {
					name: string;
				}
			).name;
			return walk(join(packagesDir, name, 'src')).map((file) => ({
				rel: relative(root, file).replaceAll('\\', '/'),
				pkg,
				src: readFileSync(file, 'utf8'),
			}));
		});
}

type SiteContext =
	| 'diagnostic'
	| 'coded-error'
	| 'thrown'
	| 'message-text'
	| 'generated-code'
	| 'docs-link'
	| 'constant'
	| 'reference';

type Site = {
	readonly file: string;
	readonly pkg: string;
	readonly line: number;
	readonly context: SiteContext;
	readonly severity?: string | null;
	readonly severitySource?: string | null;
	readonly title?: string | null;
	readonly message?: string | null;
	readonly why?: string | null;
	readonly suggestion?: string | null;
};

/** What the scan knows about one code before it becomes page data. */
export type ScannedCode = {
	readonly code: string;
	readonly pkg: string;
	readonly stage: ErrorStage;
	readonly severity: ErrorSeverity;
	readonly severities: readonly string[];
	readonly title: string | null;
	readonly message: string | null;
	readonly why: string | null;
	readonly suggestion: string | null;
	readonly printsDocsLink: boolean;
	readonly structured: boolean;
	readonly referenceOnly: boolean;
	readonly sourceFiles: readonly string[];
};

type Parsed = SourceFile & { readonly tokens: Token[] };

const RANK: Record<SiteContext, number> = {
	diagnostic: 0,
	'coded-error': 1,
	thrown: 2,
	'message-text': 3,
	'generated-code': 3,
	'docs-link': 4,
	constant: 5,
	reference: 6,
};

// The allow-directive codes are picked by a ternary inside one builder, with text in a lookup table.
const ALLOW_WHY =
	'markless-allow is a per-site escape hatch for warning diagnostics only; it must stay readable and current for the next person editing the site.';
const OVERRIDES: Record<string, { title: string; message: string; suggestion: string }> = {
	MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE: {
		title: 'markless-allow cannot suppress errors',
		message:
			'markless-allow named <code>, but <errorCode> is an error and must still be fixed.',
		suggestion: 'Fix the diagnostic or remove the markless-allow comment.',
	},
	MARKLESS_ALLOW_REASON_REQUIRED: {
		title: 'markless-allow needs a reason',
		message:
			'Use `// markless-allow CODE: reason`; for this site, write `// markless-allow <code>: reason`.',
		suggestion: '// markless-allow CODE: reason',
	},
	MARKLESS_ALLOW_STALE: {
		title: 'markless-allow did not match this site',
		message: 'markless-allow named <code>, but that diagnostic did not fire at this site.',
		suggestion: 'Fix the diagnostic or remove the markless-allow comment.',
	},
};

/** Finds every MARKLESS_* code in the given files: where it is raised, its severity, and its text. */
export function scanCodes(files: readonly SourceFile[]): ScannedCode[] {
	const parsed: Parsed[] = files.map((file) => ({ ...file, tokens: tokenize(file.src) }));

	const constants = new Map<string, string>();
	const textConstants = new Map<string, string>();
	for (const { tokens } of parsed) {
		tokens.forEach((t, k) => {
			if (t.type !== 'str' || t.exprs.length) return;
			const before = tokens[k - 2];
			if (tokens[k - 1]?.value === '=' && before?.type === 'ident' && /^[A-Z][A-Z0-9_]*$/.test(before.value))
				textConstants.set(before.value, t.value);
			if (!CODE_RE.test(t.value)) return;
			const eq = tokens[k - 1];
			const name = tokens[k - 2];
			if (
				eq?.value === '=' &&
				name?.type === 'ident' &&
				/^[A-Z][A-Z0-9_]*$/.test(name.value) &&
				!constants.has(name.value)
			)
				constants.set(name.value, t.value);
		});
	}

	function lastSegment(expr: string): string {
		let e = expr.trim();
		const wrapped = e.match(/^(?:JSON\.stringify|String|Number|escapeHtml)\(([\s\S]*)\)$/);
		if (wrapped) return lastSegment(wrapped[1]!);
		const call = e.indexOf('(');
		if (call > 0) {
			const callee = e.slice(0, call);
			e = callee.includes('.') ? callee.slice(0, callee.lastIndexOf('.')) : callee;
		}
		const m = e.match(/([A-Za-z_$][\w$]*)\s*$/);
		return m ? m[1]! : 'value';
	}

	// Constants resolve, string literals inline, any other expression becomes <name>.
	function renderTemplate(token: Token): string {
		return token.value.replace(/\uE000(\d+)\uE000/g, (_, n: string) => {
			const expr = token.exprs[Number(n)]!;
			const constant = constants.get(expr) ?? textConstants.get(expr);
			if (constant) return constant;
			const literal = expr.match(/^(['"])(.*)\1$/);
			if (literal) return literal[2]!;
			return `<${lastSegment(expr)}>`;
		});
	}

	function codeAtStart(token: Token): string | null {
		const text = token.value.replace(
			/^\uE000(\d+)\uE000/,
			(_, n: string) => constants.get(token.exprs[Number(n)]!) ?? '\uE001',
		);
		return text.match(CODE_AT_START)?.[1] ?? null;
	}

	const codes = new Map<string, Site[]>();
	const addSite = (
		code: string,
		file: Parsed,
		t: Token,
		info: Omit<Site, 'file' | 'pkg' | 'line'>,
	) => {
		const sites = codes.get(code) ?? [];
		codes.set(code, sites);
		sites.push({ file: file.rel, pkg: file.pkg, line: t.line, ...info });
	};

	// `MARKLESS_${x}_SUFFIX` where x is a local const with literal choices, or `param.toUpperCase()` of a function called with literals.
	function expandTemplateCode(token: Token, file: Parsed): string[] {
		const head = token.value.match(/^MARKLESS_[A-Z0-9_]*\uE000(\d+)\uE000[A-Z0-9_]*/);
		if (!head) return [];
		const expr = token.exprs[Number(head[1])]!;
		const before = file.src.slice(0, token.start);
		let choices: string[] = [];
		const local = expr.match(/^([A-Za-z_$][\w$]*)$/);
		if (local) {
			const decl = [
				...before.matchAll(new RegExp(`(?:const|let)\\s+${local[1]}\\s*=([^;]*);`, 'g')),
			].pop();
			if (decl) choices = [...decl[1]!.matchAll(/['"]([A-Z0-9_]+)['"]/g)].map((m) => m[1]!);
		}
		const upper = expr.match(/^([A-Za-z_$][\w$]*)\.toUpperCase\(\)$/);
		if (upper) {
			const fn = [...before.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)].pop();
			const index = fn
				? fn[2]!
						.split(',')
						.map((p) => p.trim().split(/[:=?\s]/)[0])
						.indexOf(upper[1])
				: -1;
			if (fn && index === 0)
				choices = [
					...new Set(
						[
							...file.src.matchAll(
								new RegExp(`${fn[1]}\\(\\s*['"]([^'"]+)['"]`, 'g'),
							),
						].map((m) => m[1]!.toUpperCase()),
					),
				];
		}
		return choices
			.map((c) => head[0].replace(`\uE000${head[1]}\uE000`, c))
			.filter((c) => CODE_RE.test(c));
	}

	const punct = (t: Token | undefined) => (t?.type === 'punct' ? t.value : null);

	function enclosing(tokens: Token[], k: number, open: string, close: string): number {
		let depth = 0;
		for (let j = k - 1; j >= 0; j--) {
			const v = punct(tokens[j]);
			if (v === close) depth++;
			else if (v === open) {
				if (depth === 0) return j;
				depth--;
			}
		}
		return -1;
	}

	function matching(tokens: Token[], j: number, open: string, close: string): number {
		let depth = 0;
		for (let k = j; k < tokens.length; k++) {
			const v = punct(tokens[k]);
			if (v === open) depth++;
			else if (v === close && --depth === 0) return k;
		}
		return tokens.length - 1;
	}

	// First string literal of a property value, stopping at the next depth-0 comma.
	function firstString(tokens: Token[], k: number, b: number): string | null {
		let depth = 0;
		for (; k < b; k++) {
			const t = tokens[k]!;
			if (t.type === 'punct' && '([{'.includes(t.value)) depth++;
			if (t.type === 'punct' && ')]}'.includes(t.value)) {
				if (depth === 0) return null;
				depth--;
			}
			if (depth === 0 && t.type === 'punct' && t.value === ',') return null;
			if (t.type === 'str') return t.template ? renderTemplate(t) : t.value;
		}
		return null;
	}

	// `key: <first string>` at depth 0 of the object literal spanning tokens[a..b].
	function objectProps(tokens: Token[], a: number, b: number): Record<string, string> {
		const props: Record<string, string> = {};
		let depth = 0;
		for (let k = a + 1; k < b; k++) {
			const t = tokens[k]!;
			if (t.type === 'punct' && '([{'.includes(t.value)) depth++;
			if (t.type === 'punct' && ')]}'.includes(t.value)) depth--;
			if (depth !== 0 || t.type !== 'ident' || tokens[k + 1]?.value !== ':') continue;
			const key = t.value;
			if (key in props) continue;
			if (key === 'suggestions') {
				for (let m = k + 2; m < b; m++) {
					if (
						tokens[m]!.type === 'ident' &&
						tokens[m]!.value === 'message' &&
						tokens[m + 1]?.value === ':'
					) {
						const s = firstString(tokens, m + 2, b);
						if (s) props.suggestion = s;
						break;
					}
				}
				continue;
			}
			const s = firstString(tokens, k + 2, b);
			if (s) props[key] = s;
		}
		return props;
	}

	// Walks back over a ternary chain to the first token of the expression that holds tokens[k].
	function expressionHead(tokens: Token[], k: number): number {
		const colons: number[] = [];
		let j = k - 1;
		for (; j >= 0; j--) {
			const t = tokens[j]!;
			if (t.type !== 'punct') continue;
			if (')]}'.includes(t.value)) {
				const opener = ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[
					t.value
				]!;
				j = enclosing(tokens, j, opener, t.value);
				if (j < 0) return 0;
				continue;
			}
			if (t.value === ':') colons.push(j);
			else if (t.value === '?') colons.pop();
			else if ([',', ';', '{', '(', '[', '=', '=>'].includes(t.value)) break;
		}
		return colons.length ? colons[colons.length - 1]! + 1 : j + 1;
	}

	function nearbySeverity(src: string, offset: number): string | null {
		const before = src.slice(Math.max(0, offset - 4000), offset);
		const matches = [...before.matchAll(/severity:\s*['"](error|warning|info)['"]/g)];
		return matches.length ? matches[matches.length - 1]![1]! : null;
	}

	for (const file of parsed) {
		const { tokens, src } = file;
		tokens.forEach((t, k) => {
			let code: string | null = null;
			if (t.type === 'ident' && constants.has(t.value) && tokens[k + 1]?.value !== '=')
				code = constants.get(t.value)!;
			if (t.type === 'str') {
				if (t.value.startsWith(DOCS_URL)) {
					const rendered = renderTemplate(t).replace(DOCS_URL, '');
					if (CODE_RE.test(rendered))
						addSite(rendered, file, t, { context: 'docs-link' });
					return;
				}
				code = codeAtStart(t);
				if (!code && t.template) {
					const raw = t.value.replace(/\uE000(\d+)\uE000/g, '${…}');
					const partial = raw.match(/^MARKLESS_[A-Z0-9_]*\$\{…\}[A-Z0-9_]*/);
					if (partial) {
						const message =
							renderTemplate(t)
								.replace(/^MARKLESS_[A-Z0-9_<>a-zA-Z]*?:\s*/, '')
								.trim() || null;
						for (const c of expandTemplateCode(t, file))
							addSite(c, file, t, { context: 'thrown', severity: 'error', message });
						return;
					}
				}
				// Codes quoted inside generated-code strings: "throw new Error('MARKLESS_X')".
				if (!code) {
					for (const m of t.value.matchAll(/['"](MARKLESS_[A-Z0-9_]*[A-Z0-9])['":]/g)) {
						const warns = /console\.warn\([^;]*$/.test(t.value.slice(0, m.index));
						addSite(m[1]!, file, t, {
							context: 'generated-code',
							...(warns
								? { severity: 'warning', severitySource: 'console.warn' }
								: {}),
						});
					}
					return;
				}
			}
			if (!code) return;
			// Type positions (`code: 'A' | 'B';`) name a code but raise nothing.
			const next = tokens[k + 1]?.value;
			if (
				next === '|' ||
				tokens[k - 1]?.value === '|' ||
				(next === ';' &&
					tokens[k - 1]?.value === ':' &&
					tokens[k - 2]?.type === 'ident' &&
					!['.', '?.'].includes(tokens[k - 3]?.value ?? ''))
			) {
				addSite(code, file, t, { context: 'reference' });
				return;
			}
			const head = expressionHead(tokens, k);
			const prev = tokens[head - 1];
			const prev2 = tokens[head - 2];
			if (prev?.value === ':' && prev2?.type === 'ident' && prev2.value === 'code') {
				const open = enclosing(tokens, k, '{', '}');
				const close = matching(tokens, open, '{', '}');
				const props = objectProps(tokens, open, close);
				let severity: string | null = props.severity ?? null;
				let severitySource: string | null = severity ? 'literal' : null;
				const body = tokens.slice(open, close);
				const sevIdent = body.findIndex(
					(x, n, arr) =>
						x.value === 'severity' &&
						arr[n + 1]?.value === ':' &&
						arr[n + 2]?.type === 'ident',
				);
				if (!severity && sevIdent >= 0) {
					const name = tokens[open + sevIdent + 2]!.value;
					const m = src.match(
						new RegExp(`${name}\\s*(?::[^=\\n]*)?=\\s*['"](error|warning|info)['"]`),
					);
					if (m) {
						severity = m[1]!;
						severitySource = 'constant';
					}
				}
				if (!severity) {
					const near = nearbySeverity(src, t.start);
					if (tokens[open - 2]?.value === 'semanticGraphDiagnostic') {
						severity = 'error';
						severitySource = 'helper';
					} else if (near) {
						severity = near;
						severitySource = 'nearby';
					}
				}
				addSite(code, file, t, {
					context:
						props.docsUrl || props.why || props.title ? 'diagnostic' : 'coded-error',
					severity,
					severitySource,
					title: props.title ?? null,
					message: props.message ?? null,
					why: props.why ?? null,
					suggestion: props.suggestion ?? null,
				});
				return;
			}
			if (
				[prev, tokens[k - 1]].some(
					(x) => x && ['===', '!==', '==', '!=', 'case'].includes(x.value),
				) ||
				['===', '!=='].includes(tokens[k + 1]?.value ?? '')
			) {
				addSite(code, file, t, { context: 'reference' });
				return;
			}
			if (prev?.value === '=' && prev2?.value === 'code') {
				const open = enclosing(tokens, head, '{', '}');
				const fields: Record<string, string> = {};
				if (open >= 0) {
					const close = matching(tokens, open, '{', '}');
					for (let m = open + 1; m < close; m++) {
						const key = tokens[m]!.value;
						const value = tokens[m + 2];
						if (
							tokens[m]!.type === 'ident' &&
							['title', 'severity', 'why'].includes(key) &&
							tokens[m + 1]?.value === '=' &&
							value?.type === 'str'
						)
							fields[key] ??= value.template ? renderTemplate(value) : value.value;
					}
				}
				addSite(code, file, t, {
					context: 'coded-error',
					severity: fields.severity ?? 'error',
					title: fields.title ?? null,
					why: fields.why ?? null,
				});
				return;
			}
			if (prev?.value === '=' && t.type === 'str' && !t.template && CODE_RE.test(t.value)) {
				addSite(code, file, t, { context: 'constant' });
				return;
			}
			// A message string that starts with the code: `MARKLESS_X: message`.
			if (t.type === 'str') {
				const text = t.template ? renderTemplate(t) : t.value;
				const rest = text.slice(code.length).replace(/^:\s*/, '').trim();
				if (rest && prev?.value === ':' && prev2?.type === 'ident') {
					addSite(code, file, t, { context: 'message-text', message: rest });
					return;
				}
				const warns = prev?.value === '=' && /WARN/.test(prev2?.value ?? '');
				if (rest) {
					addSite(code, file, t, {
						context: 'thrown',
						severity: warns ? 'warning' : 'error',
						severitySource: warns ? 'constant-name' : null,
						message: rest,
					});
					return;
				}
			}
			// A code handed to an error helper: the longest sibling string is the message.
			const open = enclosing(tokens, k, '(', ')');
			if (open >= 0) {
				const close = matching(tokens, open, '(', ')');
				let depth = 0;
				let message: string | null = null;
				for (let m = open + 1; m < close; m++) {
					const x = tokens[m]!;
					if (x.type === 'punct' && '([{'.includes(x.value)) depth++;
					if (x.type === 'punct' && ')]}'.includes(x.value)) depth--;
					if (depth !== 0 || x.type !== 'str' || m === k) continue;
					const text = x.template ? renderTemplate(x) : x.value;
					if (CODE_RE.test(text) || text.length < 12) continue;
					if (!message || text.length > message.length)
						message = text.replace(/^MARKLESS_[A-Z0-9_]+:\s*/, '');
				}
				addSite(code, file, t, { context: 'thrown', severity: 'error', message });
				return;
			}
			addSite(code, file, t, { context: 'reference' });
		});
	}

	return [...codes]
		.filter(([code]) => !code.endsWith('_'))
		.map(([code, unsorted]) => {
			const sites = [...unsorted].sort((a, b) => RANK[a.context] - RANK[b.context]);
			const pick = (key: 'title' | 'message' | 'why' | 'suggestion') =>
				sites.find((s) => s[key])?.[key] ?? null;
			const raising = sites.filter(
				(s) => s.context !== 'reference' && s.context !== 'docs-link',
			);
			const primary = raising[0] ?? sites[0]!;
			const severities = [
				...new Set(sites.map((s) => s.severity).filter((s): s is string => Boolean(s))),
			].sort();
			const scanned: ScannedCode = {
				code,
				pkg: primary.pkg,
				stage: stageOf(primary, sites),
				severity: (severities.length > 1
					? 'error-or-warning'
					: (severities[0] ?? 'error')) as ErrorSeverity,
				severities: severities.length ? severities : ['error'],
				title: pick('title'),
				message: pick('message'),
				why: pick('why'),
				suggestion: pick('suggestion'),
				printsDocsLink: sites.some((s) => s.context === 'docs-link'),
				structured: sites.some((s) => s.context === 'diagnostic'),
				referenceOnly: !sites.some((s) => s.context !== 'reference'),
				sourceFiles: [...new Set((raising.length ? raising : sites).map((s) => s.file))],
			};
			const override = OVERRIDES[code];
			if (!override) return scanned;
			return {
				...scanned,
				...override,
				severity: 'warning',
				severities: ['warning'],
				why: ALLOW_WHY,
				stage: 'compile',
				printsDocsLink: true,
				structured: true,
				referenceOnly: false,
				sourceFiles: ['packages/compiler/src/diagnostics.ts'],
			} satisfies ScannedCode;
		})
		.sort((a, b) => a.code.localeCompare(b.code));
}

// compile: a structured compiler diagnostic. build: the Vite plugin or build tooling. runtime: while a page renders or runs.
function stageOf(site: Site, sites: readonly Site[]): ErrorStage {
	if (sites.some((s) => s.context === 'diagnostic' && s.file.startsWith('packages/compiler/')))
		return 'compile';
	const f = site.file;
	if (
		f.startsWith('packages/compiler/') ||
		f.startsWith('packages/bundler/') ||
		f.startsWith('packages/typescript-plugin/')
	)
		return 'build';
	if (
		f.startsWith('packages/router/src/vite/') &&
		!f.startsWith('packages/router/src/vite/runtime/')
	)
		return 'build';
	return 'runtime';
}

const PACKAGE_ORDER = [
	'@markless/compiler',
	'@markless/core',
	'@markless/bundler',
	'@markless/router',
	'@markless/web',
	'@markless/serializer',
	'@markless/runtime',
	'@markless/typescript-plugin',
	'@markless/analyzer',
	'create-markless',
	'@markless/vitest-browser',
];
const MAX_SOURCES = 6;

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/** Plain text with `inline code` and [links](/path) split into segments. */
export function segments(text: string): Segment[] {
	const out: Segment[] = [];
	for (const match of text.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|[^`[]+|[`[]/g)) {
		const id = `s${out.length}`;
		if (match[1] !== undefined) out.push({ id, text: match[1], code: true });
		else if (match[2] !== undefined) out.push({ id, text: match[2], href: match[3]! });
		else out.push({ id, text: match[0] });
	}
	return out;
}

export function printedLines(e: ScannedCode): string[] {
	const lines: string[] = [];
	const head = e.message ?? e.title;
	lines.push(head ? `${e.code}: ${oneLine(head)}` : e.code);
	if (e.why) lines.push(oneLine(e.why));
	if (e.suggestion) lines.push(oneLine(e.suggestion));
	if (e.printsDocsLink) lines.push(`${DOCS_URL}${e.code}`);
	return lines;
}

function description(e: ScannedCode, guide: GuideSource | undefined): string {
	if (guide) return guide.summary;
	const where = { compile: 'build', build: 'build tooling', runtime: 'runtime' }[e.stage];
	const kind = e.severity === 'warning' ? 'warning' : 'error';
	if (e.title) return `${oneLine(e.title).replace(/[.]$/, '')}: a Markless ${where} ${kind}.`;
	return `A Markless ${where} ${kind} from ${e.pkg}.`;
}

export function kindLabel(stage: ErrorStage, severity: ErrorSeverity): string {
	return `${stage} ${severity === 'error-or-warning' ? 'error or warning' : severity}`;
}

export type Highlight = (code: string) => Promise<CodeLine[]>;

/** shiki's light and dark token colours per run, in the same channels the site's fences use. */
export async function shikiHighlight(): Promise<Highlight> {
	const { getHighlighter } = await import('./highlight-code.ts');
	const highlighter = await getHighlighter();
	const light = highlighter.getTheme('github-light').fg.toLowerCase();
	const dark = highlighter.getTheme('github-dark').fg.toLowerCase();
	return async (code) => {
		const lines = highlighter.codeToTokens(code, {
			lang: 'tsrx',
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: 'light',
		}).tokens;
		return lines.map((tokens, li) => ({
			id: `l${li}`,
			runs: tokens.map((token, ri) => {
				const style = token.htmlStyle ?? {};
				const colour = (style.color ?? '').toLowerCase();
				const darkColour = (style['--shiki-dark'] ?? '').toLowerCase();
				return {
					id: `r${ri}`,
					text: token.content,
					style: `color:${colour === light || !colour ? 'var(--ink)' : colour};--shiki-dark:${darkColour === dark || !darkColour ? 'var(--ink)' : darkColour}`,
				};
			}),
		}));
	};
}

/** Turns the scan and the hand-written guides into the data the pages render. */
export async function buildErrorData(
	scanned: readonly ScannedCode[],
	highlight: Highlight,
	written: Readonly<Record<string, GuideSource>> = guides,
): Promise<ErrorData> {
	const entries: ErrorEntry[] = [];
	for (const e of scanned) {
		const guide = written[e.code];
		const example = guide?.example ? await highlight(guide.example.join('\n')) : [];
		const warns = e.stage === 'compile' && e.severities.includes('warning');
		const exampleAllows =
			guide?.example?.some((line) => line.includes('markless-allow')) ?? false;
		const sources = e.sourceFiles.slice(0, MAX_SOURCES).map((file, index) => ({
			id: `f${index}`,
			file,
			url: `${REPO_URL}/${file}`,
		}));
		entries.push({
			code: e.code,
			packageName: e.pkg,
			stage: e.stage,
			severity: e.severity,
			description: description(e, guide),
			printed: e.message || e.title ? printedLines(e) : [],
			structured: e.structured,
			...(guide
				? {
						guide: {
							summary: guide.summary,
							what: segments(guide.what),
							how: segments(guide.how),
							example,
						},
					}
				: {}),
			...(warns && !exampleAllows
				? {
						allow: await highlight(
							`// markless-allow ${e.code}: the reason you accept it`,
						),
					}
				: {}),
			sources,
			moreSources: Math.max(0, e.sourceFiles.length - MAX_SOURCES),
		});
	}
	const byPackage = new Map<string, ErrorEntry[]>();
	for (const entry of entries) {
		const list = byPackage.get(entry.packageName) ?? [];
		byPackage.set(entry.packageName, list);
		list.push(entry);
	}
	const rank = (name: string) => PACKAGE_ORDER.indexOf(name) + 1 || 99;
	const groups: ErrorGroup[] = [...byPackage]
		.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
		.map(([packageName, list]) => ({
			packageName,
			codes: list.map((entry) => ({
				code: entry.code,
				kind: kindLabel(entry.stage, entry.severity),
				guided: Boolean(entry.guide),
			})),
		}));
	return {
		entries,
		index: {
			total: entries.length,
			guided: entries.filter((entry) => entry.guide).length,
			groups,
		},
	};
}

/** Guides whose code no source file raises any more. */
export function orphanGuides(
	scanned: readonly ScannedCode[],
	written: Readonly<Record<string, GuideSource>> = guides,
): string[] {
	const known = new Set(scanned.map((e) => e.code));
	return Object.keys(written).filter((code) => !known.has(code));
}

export async function generateErrorData(root: string = repoRoot): Promise<ErrorData> {
	return buildErrorData(scanCodes(readSourceFiles(root)), await shikiHighlight());
}

const GENERATED = '// Generated by website/tooling/errors.ts from packages/*/src. Do not edit.';

/** The committed modules, as data. */
export async function readErrorData(
	files: { readonly entries: string; readonly index: string } = {
		entries: dataFile,
		index: indexFile,
	},
): Promise<ErrorData | undefined> {
	if (!existsSync(files.entries) || !existsSync(files.index)) return undefined;
	const [{ errorEntries }, { errorIndex }] = (await Promise.all([
		import(pathToFileURL(files.entries).href),
		import(pathToFileURL(files.index).href),
	])) as [{ errorEntries: ErrorData['entries'] }, { errorIndex: ErrorData['index'] }];
	return { entries: errorEntries, index: errorIndex };
}

function writeModule(root: string, file: string, type: string, name: string, value: unknown): void {
	writeFileSync(
		file,
		[
			GENERATED,
			`import type { ${type} } from './types.ts';`,
			'',
			`export const ${name}: ${type === 'ErrorEntry' ? 'readonly ErrorEntry[]' : type} = ${JSON.stringify(value, null, '\t')};`,
			'',
		].join('\n'),
	);
	execFileSync(join(root, 'node_modules/.bin/vp'), ['fmt', file], { cwd: root, stdio: 'ignore' });
}

/** Writes the data modules when they differ from the committed ones, formatted the way the repo formats. */
export async function writeErrorData(root: string = repoRoot): Promise<boolean> {
	const data = await generateErrorData(root);
	const current = await readErrorData();
	if (current && JSON.stringify(current) === JSON.stringify(data)) return false;
	writeModule(root, dataFile, 'ErrorEntry', 'errorEntries', data.entries);
	writeModule(root, indexFile, 'ErrorIndex', 'errorIndex', data.index);
	return true;
}

/** Regenerates the error data at the start of every dev server and build. */
export function errors(): Plugin {
	let written: Promise<boolean> | undefined;
	return {
		name: 'markless-website:errors',
		async buildStart() {
			// buildStart fires once per environment; one scan per process is enough.
			written ??= writeErrorData();
			await written;
		},
	};
}

/** True when the committed modules hold exactly what a fresh scan produces. */
export async function errorDataIsCurrent(root: string = repoRoot): Promise<boolean> {
	const current = await readErrorData();
	return (
		Boolean(current) &&
		JSON.stringify(current) === JSON.stringify(await generateErrorData(root))
	);
}

if (import.meta.main) {
	if (process.argv.includes('--check')) {
		const current = await errorDataIsCurrent();
		console.log(
			current
				? 'error data is current'
				: 'error data is stale: run node website/tooling/errors.ts',
		);
		process.exit(current ? 0 : 1);
	}
	const changed = await writeErrorData();
	console.log(
		changed
			? `wrote ${relative(repoRoot, dataFile)} and errors-index.ts`
			: 'error data is current',
	);
}
