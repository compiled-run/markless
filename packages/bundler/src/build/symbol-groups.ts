// Rolldown spends a fixed ~90 KB of native memory and real time on every module, so a source's symbols that the
// pack planner treats alike ship as one module. Members are chosen from the source's own demand map; a member the
// page-wide planner would treat differently is caught there and loads on first use, never earlier.
import { parseSync } from 'rolldown/experimental';
import type { RuntimeDemandMapArtifact } from '@markless/compiler';

/** Symbols a module imports statically (render data imports derives and initializers) keep their own module. */
const UNGROUPED_KINDS: ReadonlySet<string> = new Set(['sync-computed-derive', 'state-initializer']);

export type SymbolGroupMember = {
	readonly symbolId: string;
	readonly kind: string;
	readonly source: string;
};

export type SymbolGroup = {
	/** Named by its members, so two compiles of one file that group differently never share a module id. */
	readonly groupId: string;
	readonly symbolIds: ReadonlyArray<string>;
	readonly source: string;
};

/**
 * What the pack planner can tell apart about a symbol from its own file's demand map: whether resume start runs it,
 * whether some action's first use names it, which payload record kinds list it, and its kind.
 */
export function symbolGroupKey(
	symbolId: string,
	kind: string,
	demand: RuntimeDemandMapArtifact | undefined,
): string | undefined {
	if (!demand || UNGROUPED_KINDS.has(kind)) return undefined;
	const resume = demand.firstUsePage?.resume;
	const recordKinds = new Set<string>();
	for (const record of demand.payloadRecords)
		if (record.symbolIds?.includes(symbolId)) recordKinds.add(record.kind);
	let named = false;
	for (const action of [...demand.actions, ...(demand.armActions ?? [])])
		if (action.firstUse !== 'unknown' && action.firstUse?.symbolIds.includes(symbolId))
			named = true;
	return JSON.stringify([
		kind,
		resume === undefined || resume === 'unknown'
			? 'unknown'
			: resume.symbolIds.includes(symbolId),
		named,
		[...recordKinds].sort(),
	]);
}

/**
 * Members sharing a key and the same imported modules, in member order. Loading a grouped member runs the setup of
 * every module the group imports, so members that import different modules never share one.
 */
export function planSymbolGroups(
	members: ReadonlyArray<SymbolGroupMember>,
	keyOf: (member: SymbolGroupMember) => string | undefined,
): SymbolGroup[] {
	const byKey = new Map<string, SymbolGroupMember[]>();
	for (const member of members) {
		const key = keyOf(member);
		const imports = key === undefined ? undefined : importedModules(member.source);
		if (imports === undefined) continue;
		const bucket = `${key}\n${imports.join('\n')}`;
		const list = byKey.get(bucket);
		if (list) list.push(member);
		else byKey.set(bucket, [member]);
	}
	const groups: SymbolGroup[] = [];
	for (const list of byKey.values()) {
		const merged = mergeSymbolModuleSources(list);
		if (merged) groups.push(merged);
	}
	return groups;
}

function importedModules(source: string): string[] | undefined {
	const parsed = parseMember(source);
	if (!parsed) return undefined;
	return [
		...new Set([...parsed.bindings.map((binding) => binding.source), ...parsed.bare]),
	].sort();
}

type Binding = { readonly source: string; readonly imported: string; readonly local: string };

type Parsed = {
	readonly bindings: ReadonlyArray<Binding>;
	readonly bare: ReadonlyArray<string>;
	readonly declared: ReadonlyArray<string>;
	readonly body: string;
};

/**
 * One module holding every member it can: imports merged by what they bind, then each member's other statements.
 * A member that binds a name another member binds differently, or whose shape this does not read, stays out.
 * Undefined when fewer than two members merge.
 */
export function mergeSymbolModuleSources(
	members: ReadonlyArray<SymbolGroupMember>,
): SymbolGroup | undefined {
	const bound = new Map<string, Binding>();
	const bare = new Set<string>();
	const bodies: string[] = [];
	const symbolIds: string[] = [];
	for (const member of members) {
		const parsed = parseMember(member.source);
		if (!parsed) continue;
		const clash =
			parsed.declared.some((name) => bound.has(name)) ||
			parsed.bindings.some((binding) => {
				const held = bound.get(binding.local);
				return (
					parsed.declared.includes(binding.local) ||
					(held !== undefined &&
						(held.source !== binding.source || held.imported !== binding.imported))
				);
			});
		if (clash) continue;
		for (const binding of parsed.bindings) bound.set(binding.local, binding);
		for (const name of parsed.declared)
			bound.set(name, { source: '', imported: `\0${member.symbolId}`, local: name });
		for (const text of parsed.bare) bare.add(text);
		bodies.push(parsed.body);
		symbolIds.push(member.symbolId);
	}
	if (symbolIds.length < 2) return undefined;
	return {
		groupId: groupIdOf(symbolIds),
		symbolIds,
		source: `${[...bare, ...importStatements(bound)].join('\n')}\n${bodies.join('\n')}\n`,
	};
}

function importStatements(bound: ReadonlyMap<string, Binding>): string[] {
	const bySource = new Map<string, Binding[]>();
	for (const binding of bound.values()) {
		if (!binding.source) continue;
		const list = bySource.get(binding.source);
		if (list) list.push(binding);
		else bySource.set(binding.source, [binding]);
	}
	const statements: string[] = [];
	for (const [source, bindings] of bySource) {
		const from = JSON.stringify(source);
		const named: string[] = [];
		for (const { imported, local } of bindings) {
			if (imported === '*') statements.push(`import * as ${local} from ${from};`);
			else if (imported === 'default') statements.push(`import ${local} from ${from};`);
			else
				named.push(
					imported === local
						? local
						: `${/^[A-Za-z_$][\w$]*$/.test(imported) ? imported : JSON.stringify(imported)} as ${local}`,
				);
		}
		if (named.length) statements.push(`import { ${named.join(', ')} } from ${from};`);
	}
	return statements;
}

type Node = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [key: string]: unknown;
};

function parseMember(source: string): Parsed | undefined {
	const { program, errors } = parseSync('symbol.js', source);
	if (errors.length) return undefined;
	const bindings: Binding[] = [];
	const bare: string[] = [];
	const declared: string[] = [];
	const body: string[] = [];
	for (const statement of program.body as unknown as Node[]) {
		const text = source.slice(statement.start, statement.end);
		if (statement.type === 'ImportDeclaration') {
			if (
				(statement.attributes as unknown[] | undefined)?.length ||
				statement.importKind === 'type'
			)
				return undefined;
			const from = (statement.source as { value: string }).value;
			const specifiers = (statement.specifiers as Node[] | null) ?? [];
			if (!specifiers.length) bare.push(text);
			for (const specifier of specifiers) {
				const local = (specifier.local as { name: string }).name;
				const imported =
					specifier.type === 'ImportNamespaceSpecifier'
						? '*'
						: specifier.type === 'ImportDefaultSpecifier'
							? 'default'
							: moduleExportName(
									specifier.imported as Node & { name?: string; value?: string },
								);
				bindings.push({ source: from, imported, local });
			}
			continue;
		}
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? (statement.declaration as Node | null)
				: statement;
		if (!declaration || (statement.type === 'ExportNamedDeclaration' && statement.source))
			return undefined;
		const names = declaredNames(declaration);
		if (!names) return undefined;
		declared.push(...names);
		body.push(text);
	}
	return { bindings, bare, declared, body: body.join('\n') };
}

function groupIdOf(symbolIds: ReadonlyArray<string>): string {
	let hash = 0x811c9dc5;
	const key = symbolIds.join('\n');
	for (let index = 0; index < key.length; index++)
		hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193) >>> 0;
	return `group:${hash.toString(36)}`;
}

function moduleExportName(node: { readonly name?: string; readonly value?: string }): string {
	return node.name ?? node.value ?? '';
}

// Only function declarations: loading a group must run no member's top-level code but the one being loaded.
function declaredNames(node: Node): string[] | undefined {
	if (node.type !== 'FunctionDeclaration') return undefined;
	const id = node.id as { name: string } | null;
	return id ? [id.name] : undefined;
}
