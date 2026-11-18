import type { SemanticGraphArtifact } from '../../artifacts.ts';

// Element children of the parent on one side of a repeat's rows, or 'unknown' when a sibling there renders a run-time count.
export function repeatRowSiblingElements(
	chunks: SemanticGraphArtifact['markup']['chunks'],
	repeatId: string,
	side: 'before' | 'after',
): number | 'unknown' {
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	const anchor = owner?.slots.find((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId);
	if (!owner || anchor?.coordinate.kind !== 'comment-anchor') return 'unknown';
	// Projected rows sit inside the child's element, which may render more after the hole.
	if (side === 'after' && owner.kind === 'component-projection') return 'unknown';
	return siblingElements(chunks, owner, anchor.coordinate.path, side);
}

type Chunk = SemanticGraphArtifact['markup']['chunks'][number];

function siblingElements(
	chunks: ReadonlyArray<Chunk>,
	owner: Chunk,
	path: ReadonlyArray<number>,
	side: 'before' | 'after',
): number | 'unknown' {
	const parentPath = path.slice(0, -1);
	const own = path[path.length - 1] ?? 0;
	const siblingIndex = (candidate: ReadonlyArray<number>) =>
		candidate.length === parentPath.length + 1 &&
		parentPath.every((step, depth) => candidate[depth] === step)
			? candidate[candidate.length - 1]!
			: -1;
	const indexes = [
		...owner.hosts.map((host) => siblingIndex(host.coordinate.path)),
		...owner.slots.flatMap((slot) =>
			slot.coordinate.kind === 'comment-anchor' ? [siblingIndex(slot.coordinate.path)] : [],
		),
	];
	const [from, to] = side === 'before' ? [0, own] : [own + 1, Math.max(own, ...indexes) + 1];
	let offset = 0;
	for (let index = from; index < to; index++) {
		if (owner.hosts.some((host) => siblingIndex(host.coordinate.path) === index)) {
			offset++;
			continue;
		}
		const sibling = owner.slots.find(
			(slot) => slot.coordinate.kind === 'comment-anchor' && siblingIndex(slot.coordinate.path) === index,
		);
		if (sibling && sibling.kind !== 'text') return 'unknown';
	}
	if (parentPath.length > 0 || (owner.kind !== 'async-arm' && owner.kind !== 'branch-arm'))
		return offset;
	// A fragment arm's top level shares its parent with the elements around the @try or @if.
	const holder = armHolder(chunks, owner.id);
	if (!holder) return 'unknown';
	const outer = siblingElements(chunks, holder.chunk, holder.path, side);
	return outer === 'unknown' ? outer : outer + offset;
}

function armHolder(
	chunks: ReadonlyArray<Chunk>,
	armChunkId: string,
): { readonly chunk: Chunk; readonly path: ReadonlyArray<number> } | null {
	for (const chunk of chunks)
		for (const slot of chunk.slots) {
			if (slot.coordinate.kind !== 'comment-anchor') continue;
			const arms =
				slot.kind === 'async'
					? Object.values(slot.armTemplateIds)
					: slot.kind === 'branch'
						? slot.armTemplateIds
						: [];
			if (arms.includes(armChunkId)) return { chunk, path: slot.coordinate.path };
		}
	return null;
}

// Rows a reconcile can find by neither end: a run-time count of elements stands on both sides.
export function repeatRowsUnplaceable(
	chunks: SemanticGraphArtifact['markup']['chunks'],
	repeatId: string,
): boolean {
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	const anchor = owner?.slots.find((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId);
	return (
		owner?.kind !== 'component-projection' &&
		anchor?.coordinate.kind === 'comment-anchor' &&
		repeatRowSiblingElements(chunks, repeatId, 'before') === 'unknown' &&
		repeatRowSiblingElements(chunks, repeatId, 'after') === 'unknown'
	);
}
