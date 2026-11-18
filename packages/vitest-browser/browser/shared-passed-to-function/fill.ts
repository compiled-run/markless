export function fill(b: { count: number; note: string }) {
	b.count = b.count + 2;
	b.note = `holds ${b.count}`;
}
