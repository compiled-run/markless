export function counted(level: number, value: number): number { globalThis.__signalEvaluationCounts[level]++; return value; }
