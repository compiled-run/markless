export function packName(prefix: string): string {
	return prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function iconProperty(name: string): string {
	const normalized = name.toLowerCase().replace(/-/g, '');
	return /^\d/.test(normalized) ? `icon${normalized}` : normalized;
}

export function nearestName(value: string, candidates: Iterable<string>): string | undefined {
	let nearest: string | undefined;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		const distance = editDistance(value, candidate);
		if (distance < nearestDistance) {
			nearest = candidate;
			nearestDistance = distance;
		}
	}
	return nearest;
}

function editDistance(left: string, right: string): number {
	const row = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		let previous = row[0]!;
		row[0] = leftIndex;
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const current = row[rightIndex]!;
			row[rightIndex] = Math.min(
				row[rightIndex]! + 1,
				row[rightIndex - 1]! + 1,
				previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			);
			previous = current;
		}
	}
	return row[right.length]!;
}
