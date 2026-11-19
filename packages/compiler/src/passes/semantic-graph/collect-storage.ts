import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import { storageKeyStaticDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

// storage(fallback) derives the persistence key from the AUTHORED identifier
// (markless:<name>), never a minified runtime name; storage(key, fallback) uses
// the explicit key verbatim. A key is one value on the page, whichever module reads it.
export function derivedStorageKey(identifier: string): string {
	return `markless:${identifier}`;
}

export function collectStorageBinding(input: {
	readonly name: string;
	readonly id: AnyNode | undefined;
	readonly init: AnyNode;
	readonly declarationKind: 'const' | 'let';
	readonly state: WalkState;
	readonly scope?: { readonly componentId?: string; readonly componentName?: string };
}): void {
	const args = asNodes(input.init.arguments);
	const explicit = args.length >= 2;
	// Derived keys are never null; an explicit non-literal key falls through to
	// the static-key diagnostic below.
	const key = explicit ? stringLiteral(args[0]) : derivedStorageKey(input.name);
	const fallback = explicit ? stringLiteral(args[1]) : stringLiteral(args[0]);
	if (key === null) {
		input.state.graph.diagnostics.push(
			storageKeyStaticDiagnostic({
				argument: 'key',
				call: input.init,
				filename: input.state.filename,
			}),
		);
		return;
	}
	if (fallback === null) {
		input.state.graph.diagnostics.push(
			storageKeyStaticDiagnostic({
				argument: 'fallback',
				call: input.init,
				filename: input.state.filename,
			}),
		);
		return;
	}

	const binding: SemanticGraphBinding & { readonly initialValueKnown: true } = {
		id: storageGraphId(key),
		name: input.name,
		kind: 'state',
		...input.scope,
		declarationKind: input.declarationKind,
		writable: input.declarationKind === 'let',
		valueKind: 'scalar',
		initialValue: fallback,
		initialValueKnown: true,
		storage: { key },
		sourceSpan: input.id ? sourceSpan(input.id, input.state.filename) : undefined,
	};
	input.state.graph.graphBindings.push(binding);
}

export function storageGraphId(key: string): string {
	return `storage:${key}`;
}

function stringLiteral(node: AnyNode | undefined): string | null {
	return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}
