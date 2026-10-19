import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '../../serializer/src/protocol-page-markers.ts';
import type { ResumeDomComment, ResumeDomNode } from './resume-types.ts';

// Arm-branch anchors index in their owning boundary's census (T104): every
// page-level comment walk must skip them. Own module: lean closures stay lean.
export function isArmBranchAnchorComment(comment: ResumeDomComment): boolean {
	const text = comment.data ?? (comment as { readonly textContent?: string }).textContent ?? '';
	return text.startsWith('markless:arm-branch:') || text.startsWith('/markless:arm-branch:');
}

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

export function pageCommentCensus(root: ResumeDomNode): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];
	(function visit(nodes: ArrayLike<ResumeDomNode>): void {
		for (const node of Array.from(nodes)) {
			if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))
				comments.push(node as ResumeDomComment);
			visit(node.childNodes ?? []);
		}
	})(pageNodes(root));
	return comments;
}
