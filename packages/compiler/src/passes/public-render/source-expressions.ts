export function itemPathReadSource(base: string, path: readonly string[]): string {
	const key = path[0];
	if (path.length === 1 && key && isSafePropertyName(key)) return `${base}.${key}`;
	return `readArcadePublicPath(${base}, ${JSON.stringify(path)})`;
}

export function graphReadExpression(graphNodeId: string, path: readonly string[]): string {
	return path.length === 0
		? `graph.read(${JSON.stringify(graphNodeId)})`
		: `graph.read(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`;
}

export function domNodePathExpression(base: string, path: readonly number[]): string {
	return path.reduce(
		(source, index, pathIndex) =>
			`${source}${pathIndex === 0 ? '.childNodes' : '?.childNodes'}?.[${JSON.stringify(index)}]`,
		base,
	);
}

export function samePath(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((segment, index) => segment === right[index]);
}

function isSafePropertyName(key: string): boolean {
	return /^[$A-Z_a-z][$\w]*$/.test(key);
}
