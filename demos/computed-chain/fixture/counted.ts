export function counted(level: number, value: number): number { globalThis.__chainEvaluationCounts[level]++; return value; }
