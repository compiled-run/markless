import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import { storageKeyStaticDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

const storageKeyPattern = /^[a-z][a-z0-9-]*$/;

export function isStorageKey(value: string): boolean {
	return storageKeyPattern.test(value);
}

export function collectStorageBinding(input: {
	readonly name: string;
	readonly id: AnyNode | undefined;
	readonly init: AnyNode;
	readonly state: WalkState;
}): void {
	const args = asNodes(input.init.arguments);
	const key = stringLiteral(args[0]);
	const fallback = stringLiteral(args[1]);
	if (key === null || !isStorageKey(key)) {
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
		declarationKind: 'const',
		writable: true,
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
