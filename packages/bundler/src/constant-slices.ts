// Generated client code that reads a slice of an imported constant (`art.shots.boxes[i]`) imports
// that slice alone, so a browser module never downloads the rest of a large data module.
import { readFileSync } from 'node:fs';
import { evaluateModuleConstants, parseJavaScriptModule } from '@markless/compiler';
import type { Plugin } from 'vite';
import { PACK_COST_MODEL } from './build/pack-cost-model.ts';
import { MARKLESS_VIRTUAL_PREFIX } from './source-module.ts';

const SLICE_PREFIX = `${MARKLESS_VIRTUAL_PREFIX}constant-slice:`;
const SLICED_MODULE =
	/^\0virtual:markless:(?:symbol|symbol-bundle|render-data|render-data-served):|[?&]markless-render-data(?:[&#]|$)/;
const AUTHORED_IMPORT = /\bimport\s*\{[^}]*\}\s*from\s*["'](?!@markless\/|virtual:)/;
const PLAIN_SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const MUTATING_METHODS = new Set([
	'push',
	'pop',
	'shift',
	'unshift',
	'splice',
	'sort',
	'reverse',
	'fill',
	'copyWithin',
	'set',
	'add',
	'delete',
	'clear',
]);

type Node = { type: string; start: number; end: number; [key: string]: unknown };
type Edit = { start: number; end: number; text: string };

const evaluated = new Map<
	string,
	{ source: string; constants: Readonly<Record<string, unknown>> }
>();

function moduleConstants(file: string): Readonly<Record<string, unknown>> {
	const source = readFileSync(file, 'utf8');
	const cached = evaluated.get(file);
	if (cached?.source === source) return cached.constants;
	const constants = evaluateModuleConstants({ filename: file, source });
	evaluated.set(file, { source, constants });
	return constants;
}

export function constantSliceId(
	file: string,
	exportName: string,
	path: ReadonlyArray<string | number>,
) {
	return `${SLICE_PREFIX}${encodeURIComponent(file)}:${encodeURIComponent(exportName)}:${encodeURIComponent(JSON.stringify(path))}`;
}

function sliceAt(value: unknown, path: ReadonlyArray<string | number>): unknown {
	let current = value;
	for (const segment of path) current = (current as Record<string | number, unknown>)[segment];
	return current;
}

// Only data JSON spells exactly ships as a slice: an undefined field or a non-finite number would change shape.
function plainJson(value: unknown): boolean {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
	if (Array.isArray(value)) return value.every(plainJson);
	if (typeof value === 'object')
		return (
			Object.getPrototypeOf(value) === Object.prototype &&
			Object.values(value).every(plainJson)
		);
	return false;
}

function children(node: Node): Node[] {
	const out: Node[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'start' || key === 'end' || key === 'type') continue;
		if (Array.isArray(value)) {
			for (const item of value)
				if (item && typeof item === 'object' && 'type' in item) out.push(item as Node);
		} else if (value && typeof value === 'object' && 'type' in value) out.push(value as Node);
	}
	return out;
}

function declaredNames(node: Node | undefined, into: Set<string>): void {
	if (!node) return;
	if (node.type === 'Identifier') into.add(node.name as string);
	else if (node.type === 'ObjectPattern')
		for (const property of node.properties as Node[])
			declaredNames(
				(property.type === 'RestElement' ? property.argument : property.value) as Node,
				into,
			);
	else if (node.type === 'ArrayPattern')
		for (const element of (node.elements as Node[]) ?? []) declaredNames(element, into);
	else if (node.type === 'AssignmentPattern') declaredNames(node.left as Node, into);
	else if (node.type === 'RestElement') declaredNames(node.argument as Node, into);
}

type Reference = {
	readonly chain: Node[];
	readonly path: Array<string | number>;
	readonly mutates: boolean;
};

/** Every use of `local` as the root of a member chain, with the chain cut where the value stops having that own property. */
function references(program: Node, local: string, value: unknown): Reference[] | null {
	const found: Reference[] = [];
	const shadowed = new Set<string>();
	let bare = false;
	const visit = (node: Node, parents: Node[]): void => {
		if (node.type === 'VariableDeclarator') declaredNames(node.id as Node, shadowed);
		if (/Function/.test(node.type)) {
			for (const param of (node.params as Node[]) ?? []) declaredNames(param, shadowed);
			if (node.id) declaredNames(node.id as Node, shadowed);
		}
		if (node.type === 'CatchClause') declaredNames(node.param as Node, shadowed);
		if (node.type === 'Identifier' && node.name === local) {
			const parent = parents.at(-1);
			const isKey =
				(parent?.type === 'MemberExpression' &&
					parent.property === node &&
					!parent.computed) ||
				(parent?.type === 'Property' &&
					parent.key === node &&
					!parent.computed &&
					!parent.shorthand) ||
				parent?.type === 'ImportSpecifier';
			if (!isKey) {
				const chain = [node];
				const path: Array<string | number> = [];
				let current: unknown = value;
				for (let depth = parents.length - 1; depth >= 0; depth--) {
					const member = parents[depth]!;
					if (member.type !== 'MemberExpression' || member.object !== chain.at(-1)) break;
					const property = member.property as Node;
					const key = member.computed
						? property.type === 'Literal' &&
							(typeof property.value === 'string' ||
								typeof property.value === 'number')
							? (property.value as string | number)
							: undefined
						: (property.name as string | undefined);
					if (
						key === undefined ||
						!current ||
						typeof current !== 'object' ||
						!Object.hasOwn(current as object, key)
					)
						break;
					current = (current as Record<string | number, unknown>)[key];
					path.push(key);
					chain.push(member);
				}
				if (path.length === 0) bare = true;
				const top = chain.at(-1)!;
				const above = parents[parents.length - chain.length];
				const mutates =
					(above?.type === 'AssignmentExpression' && above.left === top) ||
					above?.type === 'UpdateExpression' ||
					(above?.type === 'UnaryExpression' && above.operator === 'delete') ||
					(above?.type === 'MemberExpression' &&
						above.object === top &&
						!above.computed &&
						MUTATING_METHODS.has((above.property as Node).name as string));
				found.push({ chain, path, mutates });
			}
		}
		for (const child of children(node)) visit(child, [...parents, node]);
	};
	visit(program, []);
	if (bare || shadowed.has(local) || found.some((reference) => reference.mutates)) return null;
	return found;
}

// Slices replace the whole value when they ship fewer bytes, counting each read's property path they
// drop, or when the whole would not fit one chunk.
function slicingPays(
	value: unknown,
	roots: ReadonlyArray<ReadonlyArray<string | number>>,
	droppedPathBytes: number,
	maxModuleBytes: number,
): boolean {
	const sliced = roots.reduce(
		(sum, path) =>
			sum +
			JSON.stringify(sliceAt(value, path)).length +
			PACK_COST_MODEL.packedModuleWrapperBytes,
		0,
	);
	// A data module renders a little larger than its value's JSON: docs term-art.ts 30,511 B for 30,044.
	const whole =
		JSON.stringify(value).length * 1.015 + PACK_COST_MODEL.packedModuleWrapperBytes;
	return sliced - droppedPathBytes < whole || whole > maxModuleBytes;
}

/** The module with each imported constant it reads only in slices narrowed to those slices, or null when nothing narrows. */
export async function narrowConstantImports(
	code: string,
	resolve: (specifier: string) => Promise<string | null>,
	maxModuleBytes = Infinity,
): Promise<{ readonly code: string; readonly files: ReadonlyArray<string> } | null> {
	if (!AUTHORED_IMPORT.test(code)) return null;
	let program: Node;
	try {
		program = parseJavaScriptModule(code) as unknown as Node;
	} catch {
		return null;
	}
	const edits: Edit[] = [];
	const sliceImports: string[] = [];
	const files: string[] = [];
	const sliceLocals = new Map<string, string>();
	for (const statement of program.body as Node[]) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		const specifier = (statement.source as Node).value as string;
		if (specifier.startsWith('@markless/') || specifier.startsWith('virtual:')) continue;
		const named = (statement.specifiers as Node[]).filter(
			(entry) => entry.type === 'ImportSpecifier',
		);
		if (named.length === 0) continue;
		const file = await resolve(specifier);
		if (!file || !PLAIN_SCRIPT_FILE.test(file)) continue;
		const constants = moduleConstants(file);
		const kept: Node[] = [];
		for (const entry of statement.specifiers as Node[]) {
			const imported =
				entry.type === 'ImportSpecifier' ? (entry.imported as Node) : undefined;
			const exportName = imported ? ((imported.name ?? imported.value) as string) : undefined;
			const local = (entry.local as Node).name as string;
			const value = exportName !== undefined ? constants[exportName] : undefined;
			const uses =
				exportName !== undefined &&
				Object.hasOwn(constants, exportName) &&
				value &&
				typeof value === 'object'
					? references(program, local, value)
					: null;
			const paths = uses
				? [
						...new Map(
							uses.map((use) => [JSON.stringify(use.path), use.path]),
						).values(),
					].sort((left, right) => left.length - right.length)
				: [];
			const roots = paths.filter(
				(path, index) =>
					!paths
						.slice(0, index)
						.some((shorter) => shorter.every((segment, at) => path[at] === segment)),
			);
			if (
				!uses ||
				roots.some((path) => !plainJson(sliceAt(value, path))) ||
				!slicingPays(
					value,
					roots,
					uses.reduce((sum, use) => {
						const root = roots.find((path) =>
							path.every((segment, at) => use.path[at] === segment),
						)!;
						return sum + use.chain[root.length]!.end - use.chain[0]!.start - local.length;
					}, 0),
					maxModuleBytes,
				)
			) {
				kept.push(entry);
				continue;
			}
			for (const use of uses) {
				const root = roots.find((path) =>
					path.every((segment, at) => use.path[at] === segment),
				)!;
				const id = constantSliceId(file, exportName!, root);
				let name = sliceLocals.get(id);
				if (!name) {
					name = `marklessConstantSlice${sliceLocals.size}`;
					sliceLocals.set(id, name);
					sliceImports.push(`import ${name} from ${JSON.stringify(id)};`);
				}
				const node = use.chain[root.length]!;
				edits.push({ start: use.chain[0]!.start, end: node.end, text: name });
			}
			if (!files.includes(file)) files.push(file);
		}
		if (kept.length === named.length && kept.length === (statement.specifiers as Node[]).length)
			continue;
		const remaining = kept.map((entry) => code.slice(entry.start, entry.end));
		edits.push({
			start: statement.start,
			end: statement.end,
			text: remaining.length
				? `import ${kept.some((entry) => entry.type === 'ImportSpecifier') ? `{ ${remaining.join(', ')} }` : remaining.join(', ')} from ${JSON.stringify(specifier)};`
				: '',
		});
	}
	if (sliceImports.length === 0) return null;
	let out = code;
	for (const edit of edits.sort((left, right) => right.start - left.start))
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	return { code: `${sliceImports.join('\n')}\n${out}`, files };
}

export function constantSlicesPlugin(): Plugin {
	return {
		name: 'markless:constant-slices',
		applyToEnvironment(environment) {
			return environment.config.consumer === 'client';
		},
		resolveId: {
			filter: { id: /^virtual:markless:constant-slice:/ },
			handler(source) {
				return `\0${source}`;
			},
		},
		load: {
			filter: { id: /^\0virtual:markless:constant-slice:/ },
			handler(id) {
				const [file, exportName, path] = id
					.slice(1 + SLICE_PREFIX.length)
					.split(':')
					.map(decodeURIComponent) as [string, string, string];
				this.addWatchFile(file);
				const at = JSON.parse(path) as Array<string | number>;
				const value = sliceAt(moduleConstants(file)[exportName], at);
				const json = JSON.stringify(value);
				const limitKb = this.environment?.config.build.chunkSizeWarningLimit;
				// A slice bigger than one chunk may be is its parts, each its own module the packer can place apart.
				if (limitKb === undefined || json.length <= limitKb * 1000 || !value || typeof value !== 'object')
					return `export default ${json};`;
				const keys = Array.isArray(value) ? value.map((_, index) => index) : Object.keys(value);
				const parts = keys.map(
					(key, index) =>
						`import marklessSlicePart${index} from ${JSON.stringify(constantSliceId(file, exportName, [...at, key]))};`,
				);
				const body = Array.isArray(value)
					? `[${keys.map((_, index) => `marklessSlicePart${index}`).join(',')}]`
					: `{${keys.map((key, index) => `${JSON.stringify(key)}:marklessSlicePart${index}`).join(',')}}`;
				return `${parts.join('\n')}\nexport default ${body};`;
			},
		},
		transform: {
			// A render-data source request holds .tsrx until the Markless transform has emitted its module.
			order: 'post',
			filter: { id: SLICED_MODULE },
			async handler(code, id) {
				const limitKb = this.environment?.config.build.chunkSizeWarningLimit;
				const narrowed = await narrowConstantImports(
					code,
					async (specifier) => {
						const resolved = await this.resolve(specifier, id, { skipSelf: true });
						return resolved && !resolved.external ? resolved.id.split('?')[0]! : null;
					},
					limitKb === undefined ? Infinity : limitKb * 1000,
				);
				if (!narrowed) return null;
				for (const file of narrowed.files) this.addWatchFile(file);
				return { code: narrowed.code, map: null };
			},
		},
	};
}
