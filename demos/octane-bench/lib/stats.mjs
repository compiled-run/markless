function finiteSamples(samples) {
	const values = Array.from(samples, Number);
	if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
		throw new TypeError('samples must contain at least one finite, non-negative number');
	}
	return values;
}

function nearestRank(sorted, percentile) {
	const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
	return sorted[index];
}

export function summarizeSamples(samples) {
	const values = finiteSamples(samples);
	const sorted = [...values].sort((left, right) => left - right);
	const meanMs = values.reduce((sum, value) => sum + value, 0) / values.length;
	return {
		samples: values.length,
		minMs: sorted[0],
		p50Ms: nearestRank(sorted, 0.5),
		p95Ms: nearestRank(sorted, 0.95),
		p99Ms: nearestRank(sorted, 0.99),
		meanMs,
		opsPerSec: meanMs === 0 ? Number.POSITIVE_INFINITY : 1000 / meanMs,
	};
}
