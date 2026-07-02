import type {
	DestructuredAlias,
	SourceSpan,
	StatePathSegment,
	StateWrite,
	TsrxSemanticGraph,
} from './semantic-graph.ts';

export type LoweredStateOperation = {
	readonly sourceTarget: string;
	readonly target: string;
	readonly operation: StateWrite['operation'];
	readonly method?: string;
	readonly effect: 'scalar-cell' | 'object-path' | 'collection-mutation';
	readonly invalidates: ReadonlyArray<string>;
	readonly span?: SourceSpan;
};

export type StateLoweringDiagnostic = {
	readonly code: string;
	readonly severity: 'error';
	readonly phase: 'state-lowering';
	readonly passId: 'state-lowering';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly primarySpan?: SourceSpan;
	readonly artifactKeys: ReadonlyArray<string>;
	readonly statePath?: string;
	readonly suggestions: ReadonlyArray<{
		readonly message: string;
	}>;
	readonly docsUrl: string;
};

export type StateLoweringArtifact = {
	readonly passId: 'state-lowering';
	readonly filename: string;
	readonly operations: ReadonlyArray<LoweredStateOperation>;
	readonly diagnostics: ReadonlyArray<StateLoweringDiagnostic>;
};

type AliasBinding = {
	readonly name: string;
	readonly source: string | null;
	readonly kind: DestructuredAlias['kind'];
	readonly writability: DestructuredAlias['writability'];
};

type ResolvedWrite = {
	readonly write: StateWrite;
	readonly sourceTarget: string;
	readonly target: string;
	readonly segments: ReadonlyArray<StatePathSegment>;
	readonly sourceRoot: string | null;
	readonly alias?: AliasBinding;
};

type DiagnosticInput = {
	readonly code: string;
	readonly sourceTarget: string;
	readonly statePath?: string;
	readonly span?: SourceSpan;
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly suggestion: string;
};

export function lowerStateLvalues(graph: TsrxSemanticGraph): StateLoweringArtifact {
	const stateNames = new Set(graph.stateSites.map((site) => site.name));
	const computedNames = new Set(graph.computedSites.map((site) => site.name));
	const computedAliases = new Map(
		graph.bindingAliases
			.filter((alias) => alias.kind === 'computed')
			.map((alias) => [alias.name, alias.source]),
	);
	const aliases = new Map<string, AliasBinding>();

	for (const alias of graph.destructuredAliases) {
		aliases.set(alias.name, {
			name: alias.name,
			source: alias.source,
			kind: alias.kind,
			writability: alias.writability,
		});
	}

	const operations: LoweredStateOperation[] = [];
	const diagnostics: StateLoweringDiagnostic[] = [];

	for (const write of graph.stateWrites) {
		const resolved = resolveWrite(write, aliases);
		const root = resolved.segments[0]?.text;
		const invalid = invalidWriteDiagnostic({
			resolved,
			computedNames,
			computedAliases,
		});

		if (invalid) {
			diagnostics.push(invalid);
			continue;
		}

		if (!root || !stateNames.has(root)) continue;

		const effect = operationEffect(resolved);

		operations.push({
			sourceTarget: resolved.sourceTarget,
			target: resolved.target,
			operation: write.operation,
			method: write.method,
			effect,
			invalidates: invalidationTargets(resolved.target, effect),
			span: write.span,
		});
	}

	return {
		passId: 'state-lowering',
		filename: graph.filename,
		operations,
		diagnostics,
	};
}

function resolveWrite(
	write: StateWrite,
	aliases: ReadonlyMap<string, AliasBinding>,
): ResolvedWrite {
	const sourceSegments = write.path ?? staticPathSegments(write.target);
	const first = sourceSegments[0];
	const alias = first ? aliases.get(first.text) : undefined;

	if (alias?.source) {
		const resolvedSegments = [...staticPathSegments(alias.source), ...sourceSegments.slice(1)];

		return {
			write,
			sourceTarget: write.target,
			target: displayStatePath(resolvedSegments),
			segments: resolvedSegments,
			sourceRoot: first?.text ?? null,
			alias,
		};
	}

	return {
		write,
		sourceTarget: write.target,
		target: displayStatePath(sourceSegments),
		segments: sourceSegments,
		sourceRoot: first?.text ?? null,
		alias,
	};
}

function invalidWriteDiagnostic(input: {
	readonly resolved: ResolvedWrite;
	readonly computedNames: ReadonlySet<string>;
	readonly computedAliases: ReadonlyMap<string, string>;
}): StateLoweringDiagnostic | null {
	const { resolved } = input;
	const sourceTarget = resolved.sourceTarget;
	const sourceRoot = resolved.sourceRoot;
	const span = resolved.write.span;
	const computedSource = sourceRoot ? input.computedAliases.get(sourceRoot) : undefined;

	if (sourceRoot && input.computedNames.has(sourceRoot)) {
		return createDiagnostic({
			code: 'MARKLESS_STATE_COMPUTED_READONLY',
			sourceTarget,
			statePath: sourceRoot,
			span,
			title: 'Cannot write to computed state',
			message: `The write target "${sourceTarget}" is a computed binding.`,
			why: 'computed() creates derived graph state and is read-only in v1.',
			suggestion: 'Write to the source state that the computed value derives from.',
		});
	}

	if (computedSource) {
		return createDiagnostic({
			code: 'MARKLESS_STATE_COMPUTED_READONLY',
			sourceTarget,
			statePath: computedSource,
			span,
			title: 'Cannot write to computed state',
			message: `The write target "${sourceTarget}" aliases computed binding "${computedSource}".`,
			why: 'computed() aliases remain read-only because assigning through them would not update a concrete graph cell.',
			suggestion: 'Write to the source state that the computed value derives from.',
		});
	}

	if (resolved.alias?.kind === 'props-path' || resolved.segments[0]?.text === 'props') {
		return createDiagnostic({
			code: 'MARKLESS_STATE_PROPS_READONLY',
			sourceTarget,
			statePath: resolved.target,
			span,
			title: 'Cannot write to props',
			message: `The write target "${sourceTarget}" resolves to read-only props path "${resolved.target}".`,
			why: 'Component props are getter-backed graph reads and cannot be mutated by the child in v1.',
			suggestion: 'Pass an event callback or write to local state derived from the prop.',
		});
	}

	if (resolved.alias?.kind === 'state-path' && resolved.alias.writability === 'ambiguous-write') {
		return createDiagnostic({
			code: 'MARKLESS_STATE_ALIAS_AMBIGUOUS_WRITE',
			sourceTarget,
			statePath: resolved.alias.source ?? undefined,
			span,
			title: 'Cannot write through ambiguous state alias',
			message: `The write target "${sourceTarget}" is a destructured state alias that cannot safely preserve JavaScript assignment semantics.`,
			why: 'The compiler only lowers alias writes when the alias maps back to a writable graph path without changing normal JavaScript behavior.',
			suggestion: 'Write to the original state path directly.',
		});
	}

	if (resolved.alias?.kind === 'state-path' && resolved.alias.writability === 'local-copy') {
		return createDiagnostic({
			code: 'MARKLESS_STATE_ALIAS_LOCAL_COPY',
			sourceTarget,
			statePath: resolved.alias.source ?? undefined,
			span,
			title: 'Cannot write through local copy alias',
			message: `The write target "${sourceTarget}" is a local value copied out of state.`,
			why: 'Array destructuring produces a local binding here, not a stable graph path that assignment can update.',
			suggestion:
				'Write through the original state array path or use a supported collection mutation.',
		});
	}

	return null;
}

function createDiagnostic(input: DiagnosticInput): StateLoweringDiagnostic {
	return {
		code: input.code,
		severity: 'error',
		phase: 'state-lowering',
		passId: 'state-lowering',
		title: input.title,
		message: input.message,
		why: input.why,
		primarySpan: input.span,
		artifactKeys: [`write:${input.sourceTarget}`],
		statePath: input.statePath,
		suggestions: [{ message: input.suggestion }],
		docsUrl: `https://markless.dev/errors/${input.code}`,
	};
}

function operationEffect(resolved: ResolvedWrite): LoweredStateOperation['effect'] {
	if (resolved.write.operation === 'call') return 'collection-mutation';
	return resolved.segments.length <= 1 ? 'scalar-cell' : 'object-path';
}

function invalidationTargets(
	target: string,
	effect: LoweredStateOperation['effect'],
): ReadonlyArray<string> {
	if (effect === 'collection-mutation') {
		return [target, `${target}.length`, `${target}.*`];
	}

	return [target];
}

function staticPathSegments(path: string): ReadonlyArray<StatePathSegment> {
	return path.split('.').map((text, index) => ({
		kind: index === 0 ? 'binding' : 'property',
		text,
	}));
}

function displayStatePath(segments: ReadonlyArray<StatePathSegment>): string {
	const [first, ...rest] = segments;
	if (!first) return '';

	let path = first.text;

	for (const segment of rest) {
		if (segment.kind === 'dynamic') {
			path += `[${segment.text}]`;
			continue;
		}

		if (segment.kind === 'literal') {
			path += /^\d+$/.test(segment.text)
				? `[${segment.text}]`
				: `[${JSON.stringify(segment.text)}]`;
			continue;
		}

		path += `.${segment.text}`;
	}

	return path;
}
