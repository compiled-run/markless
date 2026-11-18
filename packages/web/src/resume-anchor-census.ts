import {
	PROTOCOL_BLOCK_START_COMMENT,
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_UNCOUNTED_COMMENT,
} from '../../serializer/src/protocol-page-markers.ts';
import type { ResumeDomComment, ResumeDomElement, ResumeDomNode } from './resume-types.ts';

export const isUncountedComment = (comment: ResumeDomComment): boolean =>
	PROTOCOL_UNCOUNTED_COMMENT.test(
		comment.data ?? (comment as { readonly textContent?: string }).textContent ?? '',
	);

// The page's children: between the markers an author's element as the container carries.
export function pageNodes<N extends { nodeType?: number }>(root: {
	childNodes?: ArrayLike<N>;
}): N[] {
	let nodes: N[] = [];
	for (const child of Array.from(root.childNodes ?? [])) {
		const data = child.nodeType === 8 ? (child as { data?: string }).data : undefined;
		if (data === PROTOCOL_CONTAINER_START_COMMENT) nodes = [];
		else if (data === PROTOCOL_CONTAINER_END_COMMENT) break;
		else nodes.push(child);
	}
	return nodes;
}

// Indexes count the served page: a streamed arm's comments are skipped unless `live` asks for them.
export function pageCommentCensus(root: ResumeDomNode, live?: boolean): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];
	(function visit(nodes: ArrayLike<ResumeDomNode>): void {
		for (const node of Array.from(nodes)) {
			if (node.nodeType === 8 && !isUncountedComment(node as ResumeDomComment))
				comments.push(node as ResumeDomComment);
			visit(node.childNodes ?? []);
		}
	})((!live && (root as ResumeDomElement).__marklessComments) || pageNodes(root));
	return comments;
}

export const elementsOf = (nodes: readonly ResumeDomNode[]) =>
	nodes.filter((node): node is ResumeDomElement => node.nodeType === 1);

// Walks a ProtocolElementAddress.
export function marklessElementAt(from: unknown, address: ReadonlyArray<number>) {
	let node = from as ResumeDomNode | undefined;
	for (const step of address) {
		const steps: ResumeDomNode[] = [];
		let end: string | undefined;
		for (const child of Array.from(node?.childNodes ?? [])) {
			const data = child.nodeType === 8 ? (child as ResumeDomComment).data : undefined;
			if (end) end = data === end ? undefined : end;
			else if (child.nodeType === 1 || (data && PROTOCOL_BLOCK_START_COMMENT.test(data))) {
				steps.push(child);
				if (data) end = `/${data}`;
			}
		}
		node = steps.at(step);
	}
	return node?.nodeType === 1 ? (node as ResumeDomElement) : undefined;
}
