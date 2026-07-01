import type { CompilerPassDefinition, CompilerPassGraph } from './artifacts.ts';

export type CompilerPassGraphErrorReason =
	| 'duplicate-pass-id'
	| 'duplicate-artifact-producer'
	| 'missing-artifact'
	| 'dependency-cycle'
	| 'missing-pass-output'
	| 'undeclared-pass-output';

export type CompilerPassGraphDiagnostic = {
	readonly code: 'MARKLESS_COMPILER_PASS_GRAPH_INVALID';
	readonly severity: 'error';
	readonly phase: 'runtime';
	readonly title: 'Invalid compiler pass graph';
	readonly message: string;
	readonly why: string;
	readonly reason: CompilerPassGraphErrorReason;
	readonly passId: string;
	readonly artifactKeys: ReadonlyArray<string>;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class CompilerPassGraphError extends Error implements CompilerPassGraphDiagnostic {
	readonly code = 'MARKLESS_COMPILER_PASS_GRAPH_INVALID' as const;
	readonly severity = 'error' as const;
	readonly phase = 'runtime' as const;
	readonly title = 'Invalid compiler pass graph' as const;
	readonly why: string;
	readonly reason: CompilerPassGraphErrorReason;
	readonly passId: string;
	readonly artifactKeys: ReadonlyArray<string>;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl = 'https://markless.dev/errors/MARKLESS_COMPILER_PASS_GRAPH_INVALID';

	constructor(input: {
		readonly message: string;
		readonly why: string;
		readonly reason: CompilerPassGraphErrorReason;
		readonly passId: string;
		readonly artifactKeys: ReadonlyArray<string>;
		readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	}) {
		super(input.message);
		this.name = 'CompilerPassGraphError';
		this.why = input.why;
		this.reason = input.reason;
		this.passId = input.passId;
		this.artifactKeys = input.artifactKeys;
		this.suggestions = input.suggestions;
	}
}

export function validateCompilerPassGraph(
	passes: ReadonlyArray<CompilerPassDefinition>,
	initialArtifacts: ReadonlyArray<string>,
): CompilerPassGraph {
	const producers = new Map<string, string>();
	const passIds = new Set<string>();

	for (const pass of passes) {
		if (passIds.has(pass.passId)) {
			throw passGraphError({
				message: `Compiler pass "${pass.passId}" is declared more than once.`,
				why: 'Every compiler pass needs a stable pass ID so diagnostics, artifact dumps, and pass ordering point at one owning pass.',
				reason: 'duplicate-pass-id',
				passId: pass.passId,
				artifactKeys: [],
				suggestion:
					'Give each pass a unique passId, or merge the duplicate declarations into one pass-owned module.',
			});
		}
		passIds.add(pass.passId);

		for (const artifact of pass.produces) {
			const producer = producers.get(artifact);
			if (producer) {
				throw passGraphError({
					message: `Compiler artifact "${artifact}" is produced by both "${producer}" and "${pass.passId}".`,
					why: 'Each compiler artifact must have one owning producer so downstream passes can trust the artifact contract.',
					reason: 'duplicate-artifact-producer',
					passId: pass.passId,
					artifactKeys: [artifact],
					suggestion:
						'Move shared data into one producer artifact or version the artifact instead of producing it from multiple passes.',
				});
			}

			producers.set(artifact, pass.passId);
		}
	}

	const knownArtifacts = new Set(initialArtifacts);
	const orderedPassIds: string[] = [];
	const remaining = [...passes];

	while (remaining.length > 0) {
		const nextIndex = remaining.findIndex((pass) =>
			pass.consumes.every((artifact) => knownArtifacts.has(artifact)),
		);

		if (nextIndex === -1) {
			const missing = findMissingCompilerArtifact(remaining, knownArtifacts, producers);
			if (missing) {
				throw passGraphError({
					message: `Missing compiler artifact "${missing.artifact}" consumed by pass "${missing.passId}".`,
					why: 'A compiler pass declared an input artifact that is not provided by the initial artifacts or by any registered producer.',
					reason: 'missing-artifact',
					passId: missing.passId,
					artifactKeys: [missing.artifact],
					suggestion:
						'Register the pass that produces this artifact, rename the consumed artifact key, or add it to the initial artifact set.',
				});
			}

			const passIds = remaining.map((pass) => pass.passId);
			const artifactKeys = remaining.flatMap((pass) => pass.produces);
			throw passGraphError({
				message: `Compiler pass graph has a dependency cycle involving ${passIds.join(', ')}.`,
				why: 'The compiler cannot derive a runnable pass order because the remaining passes depend on artifacts produced by each other.',
				reason: 'dependency-cycle',
				passId: passIds.join(','),
				artifactKeys,
				suggestion:
					'Break the cycle by moving shared data into an earlier artifact or splitting one pass boundary into producer and consumer phases.',
			});
		}

		const [pass] = remaining.splice(nextIndex, 1);
		orderedPassIds.push(pass.passId);

		for (const artifact of pass.produces) {
			knownArtifacts.add(artifact);
		}
	}

	return {
		orderedPassIds,
		artifacts: [...knownArtifacts],
	};
}

function passGraphError(input: {
	readonly message: string;
	readonly why: string;
	readonly reason: CompilerPassGraphErrorReason;
	readonly passId: string;
	readonly artifactKeys: ReadonlyArray<string>;
	readonly suggestion: string;
}): CompilerPassGraphError {
	return new CompilerPassGraphError({
		message: input.message,
		why: input.why,
		reason: input.reason,
		passId: input.passId,
		artifactKeys: input.artifactKeys,
		suggestions: [{ message: input.suggestion }],
	});
}

function findMissingCompilerArtifact(
	passes: ReadonlyArray<CompilerPassDefinition>,
	knownArtifacts: ReadonlySet<string>,
	producers: ReadonlyMap<string, string>,
): { readonly artifact: string; readonly passId: string } | null {
	for (const pass of passes) {
		for (const artifact of pass.consumes) {
			if (!knownArtifacts.has(artifact) && !producers.has(artifact)) {
				return {
					artifact,
					passId: pass.passId,
				};
			}
		}
	}

	return null;
}
