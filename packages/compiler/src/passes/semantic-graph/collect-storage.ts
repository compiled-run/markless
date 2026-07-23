import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import { storageKeyStaticDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

// storage(fallback) derives the persistence key from the binding identifier,
// namespaced (markless:<name>) so cross-module keys never collide by accident.
// storage(key, fallback) uses the explicit key VERBATIM — the escape hatch for
// interop with an existing store or deliberate cross-module sharing. The derived
// key is a compile-time literal baked from the AUTHORED identifier, so it is
// stable and never depends on a minified runtime name.
export function derivedStorageKey(identifier: string): string {
	return `markless:${identifier}`;
}

export function collectStorageBinding(input: {
	readonly name: string;
	readonly id: AnyNode | undefined;
	readonly init: AnyNode;
	readonly declarationKind: 'const' | 'let';
	readonly state: WalkState;
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
		id: storageGraphId(input.state.filename, key),
		name: input.name,
		kind: 'state',
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

export function storageGraphId(moduleId: string, key: string): string {
	return `storage:${moduleId}#${key}`;
}

function stringLiteral(node: AnyNode | undefined): string | null {
	return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}
