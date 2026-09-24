export type Finding = { readonly guard: string; readonly message: string };
export type Evaluation = { readonly failures: Finding[]; readonly notes: Finding[] };
export type Measurement = { readonly sites: Record<string, unknown> };
export type Anchors = Record<string, unknown>;

export function measure(options?: {
	readonly build?: boolean;
	readonly sites?: readonly ('bench' | 'docs')[];
	readonly log?: (message: string) => void;
}): Promise<Measurement>;
export function evaluate(measurement: Measurement, anchors: Anchors): Evaluation;
export function formatReport(evaluation: Evaluation): string;
export function readAnchors(path?: string): Anchors;
export function saveLastMeasurement(measurement: Measurement): void;
