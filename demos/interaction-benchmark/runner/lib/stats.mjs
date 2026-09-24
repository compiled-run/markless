// Linear-interpolation quantile (Hyndman-Fan type 7) over a sorted copy.
export function quantile(values, q) {
	if (!values.length) return null;
	const s = [...values].sort((a, b) => a - b);
	const pos = (s.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function describe(values) {
	const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
	if (!v.length) return { n: 0, median: null, p95: null, mean: null, stddev: null, q1: null, q3: null, iqr: null, mad: null, min: null, max: null };
	const mean = v.reduce((a, b) => a + b, 0) / v.length;
	const stddev = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
	const median = quantile(v, 0.5);
	const q1 = quantile(v, 0.25);
	const q3 = quantile(v, 0.75);
	return {
		n: v.length,
		median,
		p95: quantile(v, 0.95),
		mean,
		stddev,
		q1,
		q3,
		iqr: q3 - q1,
		mad: quantile(v.map((x) => Math.abs(x - median)), 0.5),
		min: Math.min(...v),
		max: Math.max(...v),
	};
}
