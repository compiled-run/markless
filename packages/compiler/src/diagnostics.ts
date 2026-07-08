export type SourceSpan = {
	readonly filename: string;
	readonly start: number;
	readonly end: number;
};

export type DiagnosticSuggestion = {
	readonly message: string;
};

export type CompilerDiagnostic = {
	readonly code: string;
	readonly severity: 'error' | 'warning' | 'info';
	readonly phase:
		| 'parse'
		| 'semantic-graph'
		| 'state-lowering'
		| 'capture-analysis'
		| 'sync-policy'
		| 'public-render'
		| 'serialization'
		| 'payload'
		| 'resume'
		| 'runtime';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly primarySpan?: SourceSpan;
	readonly passId?: string;
	readonly artifactKeys?: ReadonlyArray<string>;
	readonly statePath?: string;
	readonly source?: string;
	readonly symbolId?: string;
	readonly elementLocator?: string;
	readonly suggestions: ReadonlyArray<DiagnosticSuggestion>;
	readonly docsUrl: string;
	readonly suppressed?: true;
	readonly suppressionReason?: string;
};

type AllowInput<T extends CompilerDiagnostic = CompilerDiagnostic> = {
	readonly source: string;
	readonly filename: string;
	readonly diagnostics: ReadonlyArray<T>;
	readonly phase: T['phase'];
	readonly passId?: string;
	readonly artifactKeys?: ReadonlyArray<string>;
};

export function applyMarklessAllowDirectives<T extends CompilerDiagnostic>(
	input: AllowInput<T>,
): ReadonlyArray<T | CompilerDiagnostic> {
	const directives: Array<{
		index: number;
		code: string;
		reason: string | null;
		line: number;
		span: SourceSpan;
	}> = [];
	let offset = 0;
	input.source.split('\n').forEach((text, line) => {
		const start = text.indexOf('//');
		const match =
			start === -1
				? null
				: /^\/\/\s*markless-allow\s+([A-Z0-9_]+)(?::\s*(.*))?$/.exec(
						text.slice(start).trimEnd(),
					);
		if (match) {
			directives.push({
				index: directives.length,
				code: match[1] ?? '',
				reason: match[2]?.trim() || null,
				line,
				span: {
					filename: input.filename,
					start: offset + start,
					end: offset + text.length,
				},
			});
		}
		offset += text.length + 1;
	});
	if (!directives.length) return input.diagnostics;
	const used = new Set<number>();
	const output: Array<T | CompilerDiagnostic> = [];
	for (const diagnostic of input.diagnostics) {
		const span = diagnostic.primarySpan;
		const siteLine = span?.filename === input.filename ? lineAt(input.source, span.start) : -1;
		const directive = directives.find(
			(item) =>
				!used.has(item.index) &&
				item.code === diagnostic.code &&
				(item.line === siteLine || item.line + 1 === siteLine),
		);
		if (!directive) {
			output.push(diagnostic);
			continue;
		}
		used.add(directive.index);
		output.push(
			directive.reason && diagnostic.severity === 'warning'
				? { ...diagnostic, suppressed: true as const, suppressionReason: directive.reason }
				: diagnostic,
		);
		if (!directive.reason) output.push(allowDirectiveDiagnostic('reason', directive, input));
		else if (diagnostic.severity === 'error')
			output.push(allowDirectiveDiagnostic('error', directive, input, diagnostic.code));
	}
	for (const directive of directives) {
		if (used.has(directive.index)) continue;
		output.push(
			allowDirectiveDiagnostic(directive.reason ? 'stale' : 'reason', directive, input),
		);
	}
	return output;
}

type AllowDirective = {
	readonly code: string;
	readonly reason: string | null;
	readonly span: SourceSpan;
};

function allowDirectiveDiagnostic(
	kind: 'error' | 'reason' | 'stale',
	directive: AllowDirective,
	input: Pick<AllowInput, 'phase' | 'passId' | 'artifactKeys'>,
	errorCode = directive.code,
): CompilerDiagnostic {
	const messages = {
		error: [
			`markless-allow named ${directive.code}, but ${errorCode} is an error and must still be fixed.`,
			'markless-allow cannot suppress errors',
		],
		reason: [
			`Use \`// markless-allow CODE: reason\`; for this site, write \`// markless-allow ${directive.code}: reason\`.`,
			'markless-allow needs a reason',
		],
		stale: [
			`markless-allow named ${directive.code}, but that diagnostic did not fire at this site.`,
			'markless-allow did not match this site',
		],
	} as const;
	const code =
		kind === 'error'
			? 'MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE'
			: kind === 'reason'
				? 'MARKLESS_ALLOW_REASON_REQUIRED'
				: 'MARKLESS_ALLOW_STALE';
	return {
		code,
		severity: 'warning',
		phase: input.phase,
		title: messages[kind][1],
		message: messages[kind][0],
		why: 'markless-allow is a per-site escape hatch for warning diagnostics only; it must stay readable and current for the next person editing the site.',
		primarySpan: directive.span,
		passId: input.passId,
		artifactKeys: input.artifactKeys,
		suggestions: [
			{
				message:
					kind === 'reason'
						? '// markless-allow CODE: reason'
						: 'Fix the diagnostic or remove the markless-allow comment.',
			},
		],
		docsUrl: `https://markless.dev/errors/${code}`,
	};
}

function lineAt(source: string, offset: number): number {
	return source.slice(0, offset).split('\n').length - 1;
}
