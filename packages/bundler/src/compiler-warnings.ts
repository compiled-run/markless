// Prints the compiler's warning diagnostics once per module source, in the author's file:line terms.
import type { CompilerDiagnostic } from '@markless/compiler';
import { relative } from 'pathe';

type WarnContext = { warn?: (message: string) => void };

export function formatCompilerWarning(
	diagnostic: CompilerDiagnostic,
	input: { readonly filename: string; readonly source: string; readonly root?: string },
): string {
	const span = diagnostic.primarySpan;
	const file = input.root ? relative(input.root, input.filename) : input.filename;
	const before = span && span.filename === input.filename ? input.source.slice(0, span.start) : null;
	const location =
		before === null
			? file
			: `${file}:${before.split('\n').length}:${before.length - before.lastIndexOf('\n')}`;
	return [
		`${diagnostic.code} ${location}: ${diagnostic.message}`,
		diagnostic.suggestions[0]?.message,
		diagnostic.docsUrl,
	]
		.filter((line): line is string => Boolean(line))
		.join('\n  ');
}

export function createCompilerWarningLog() {
	const printed = new Map<string, { readonly source: string; readonly lines: Set<string> }>();
	return {
		report(
			pluginContext: WarnContext,
			input: { readonly filename: string; readonly source: string; readonly root?: string },
			warnings: ReadonlyArray<CompilerDiagnostic> | undefined,
		): void {
			if (!warnings?.length || typeof pluginContext.warn !== 'function') return;
			let seen = printed.get(input.filename);
			// An edited source warns afresh; the same source compiled for another request or environment does not.
			if (seen?.source !== input.source) {
				seen = { source: input.source, lines: new Set() };
				printed.set(input.filename, seen);
			}
			for (const diagnostic of warnings) {
				const line = formatCompilerWarning(diagnostic, input);
				if (seen.lines.has(line)) continue;
				seen.lines.add(line);
				pluginContext.warn(line);
			}
		},
		clear(): void {
			printed.clear();
		},
	};
}
