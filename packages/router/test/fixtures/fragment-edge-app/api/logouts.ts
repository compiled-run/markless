export default function logouts() {
	return { count: (globalThis as { __logouts?: number }).__logouts ?? 0 };
}
