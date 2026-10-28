import { PROTOCOL_PROPERTY_ONLY_MEMBERS } from '../../../serializer/src/protocol-dom-properties.ts';

// Installed only by a compiled module whose markup carries a member with no live attribute.
type Seedable = {
	readonly children?: ArrayLike<Seedable>;
	getAttribute?(name: string): string | null;
	removeAttribute?(name: string): void;
} & Record<string, unknown>;

function seedBuiltProperties(nodes: ArrayLike<unknown>): void {
	for (const node of Array.from(nodes) as Seedable[]) {
		for (const name of PROTOCOL_PROPERTY_ONLY_MEMBERS) {
			const value = node.getAttribute?.(name);
			if (value == null) continue;
			node.removeAttribute!(name);
			node[name] = name === 'indeterminate' ? true : Number(value);
		}
		if (node.children) seedBuiltProperties(node.children);
	}
}

export function installMarklessPropertySeeds(): void {
	(
		globalThis as { __marklessPropertySeeds?: typeof seedBuiltProperties }
	).__marklessPropertySeeds ??= seedBuiltProperties;
}
