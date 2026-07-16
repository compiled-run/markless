import type { CompileTsrxModuleResult } from './artifacts.ts';
import type { CompilerDiagnostic } from './diagnostics.ts';

type DiagnosticIdentity = readonly [
	code: unknown,
	message: unknown,
	filename: unknown,
	start: unknown,
	end: unknown,
];

// Build tooling uses this as the complete diagnostic boundary for a compiled module.
export function collectTsrxModuleDiagnostics(
	result: CompileTsrxModuleResult,
): readonly CompilerDiagnostic[] {
	const diagnostics: CompilerDiagnostic[] = [];
	const identities: DiagnosticIdentity[] = [];
	const visited = new Set<object>();

	function visit(value: unknown): void {
		if (!isObject(value) || visited.has(value)) return;
		visited.add(value);

		if (Array.isArray(value)) {
			for (const entry of value) visit(entry);
			return;
		}
		if (!isPlainObject(value)) return;

		for (const [key, entry] of Object.entries(value)) {
			if (key === 'diagnostics' && Array.isArray(entry)) {
				for (const candidate of entry) {
					if (!isCompilerDiagnostic(candidate)) continue;
					const identity = diagnosticIdentity(candidate);
					if (identities.some((seen) => sameIdentity(seen, identity))) continue;
					identities.push(identity);
					diagnostics.push(candidate);
				}
			}
			visit(entry);
		}
	}

	visit(result);
	return diagnostics;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPlainObject(value: object): value is Record<string, unknown> {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isCompilerDiagnostic(value: unknown): value is CompilerDiagnostic {
	return isObject(value) && typeof value.code === 'string' && typeof value.severity === 'string';
}

function diagnosticIdentity(diagnostic: CompilerDiagnostic): DiagnosticIdentity {
	const primarySpan = isObject(diagnostic.primarySpan) ? diagnostic.primarySpan : undefined;
	return [
		diagnostic.code,
		diagnostic.message,
		primarySpan?.filename,
		primarySpan?.start,
		primarySpan?.end,
	];
}

function sameIdentity(left: DiagnosticIdentity, right: DiagnosticIdentity): boolean {
	return left.every((value, index) => Object.is(value, right[index]));
}
