import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';

/** A name a destructured `@for` binds, and where on the row item its value sits. */
export type RepeatItemAlias = { readonly name: string; readonly path: ReadonlyArray<string> };

export type RepeatItemBinding = {
	readonly itemName: string;
	readonly aliases: ReadonlyArray<RepeatItemAlias>;
};

/**
 * The row item a `@for` header binds. A plain name is the item; a destructured
 * one (`const [key, value]`, `const { id, name }`) binds each of its names to a
 * path on an item the compiler names itself, so every pass reads the row through
 * one item as it does for a plain name. Null when the header binds nothing this
 * can follow: a default value, a rest element or a computed key.
 */
export function repeatItemBinding(node: AnyNode): RepeatItemBinding | null {
	const id = repeatItemPattern(node);
	const name = getIdentifierName(id);
	if (name) return { itemName: name, aliases: [] };
	if (!id || typeof id.start !== 'number') return null;
	const aliases: RepeatItemAlias[] = [];
	if (!collectAliases(id, [], aliases)) return null;
	return { itemName: `marklessRowItem${id.start}`, aliases };
}

/** The binding target of a `@for` header: an identifier or a destructuring pattern. */
export function repeatItemPattern(node: AnyNode): AnyNode | undefined {
	const left = node.left as AnyNode | undefined;
	if (left?.type !== 'VariableDeclaration') return left;
	return asNodes(left.declarations)[0]?.id as AnyNode | undefined;
}

/** The path on the row item a source rooted in an alias reads (`name` or `name.first`), or null. */
export function aliasedItemPath(
	aliases: ReadonlyArray<RepeatItemAlias> | undefined,
	source: string,
): ReadonlyArray<string> | null {
	for (const alias of aliases ?? []) {
		if (source === alias.name) return alias.path;
		if (!source.startsWith(`${alias.name}.`)) continue;
		const rest = source.slice(alias.name.length + 1).split('.');
		return rest.every((segment) => /^[A-Za-z_$][\w$]*$/.test(segment))
			? [...alias.path, ...rest]
			: null;
	}
	return null;
}

function collectAliases(
	node: AnyNode,
	path: ReadonlyArray<string>,
	out: RepeatItemAlias[],
): boolean {
	if (node.type === 'Identifier') {
		const name = getIdentifierName(node);
		if (!name) return false;
		out.push({ name, path });
		return true;
	}
	if (node.type === 'ArrayPattern') {
		const elements = Array.isArray(node.elements)
			? (node.elements as Array<AnyNode | null>)
			: [];
		return elements.every(
			(element, index) =>
				element === null ||
				(element.type !== 'RestElement' &&
					collectAliases(element, [...path, String(index)], out)),
		);
	}
	if (node.type === 'ObjectPattern')
		return asNodes(node.properties).every((property) => {
			if (property.type !== 'Property' || property.computed === true) return false;
			const key = property.key as AnyNode | undefined;
			const name =
				getIdentifierName(key) ?? (typeof key?.value === 'string' ? key.value : null);
			return name !== null && collectAliases(property.value as AnyNode, [...path, name], out);
		});
	return false;
}

/** Every name a `@for` header binds for its row: the item, each destructured name, and the index. */
export function rowBoundNames(
	repeat:
		| {
				readonly itemName: string;
				readonly itemAliases?: ReadonlyArray<RepeatItemAlias>;
				readonly indexName?: string;
		  }
		| undefined,
): string[] {
	if (!repeat) return [];
	return [
		repeat.itemName,
		...(repeat.itemAliases ?? []).map((alias) => alias.name),
		...(repeat.indexName ? [repeat.indexName] : []),
	];
}

/** How a diagnostic names a row's item: the loop name, or the destructuring as written. */
export function rowItemLabel(repeat: {
	readonly itemName: string;
	readonly itemPattern?: string;
}): string {
	return repeat.itemPattern ?? repeat.itemName;
}
