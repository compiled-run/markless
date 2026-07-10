import type { AnalyzerInvariantResult } from './contracts.ts';

export interface WitnessBoxOutcome {
	readonly name: string;
	readonly tags: readonly string[];
	readonly passed: boolean;
	readonly receiptPath: string;
	readonly details?: readonly string[];
}

export function createWitnessVerdict(outcome: WitnessBoxOutcome): AnalyzerInvariantResult {
	return {
		id: 'MLA-EXT-WITNESS',
		status: outcome.passed ? 'pass' : 'fail',
		details: [
			`box: ${outcome.name}`,
			`tags: ${outcome.tags.join(', ')}`,
			`receipt: ${outcome.receiptPath}`,
			...(outcome.details ?? []),
		],
	};
}
