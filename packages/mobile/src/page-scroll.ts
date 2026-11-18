import { NATIVE_UNSUPPORTED_CODE, type CompilerDiagnostic } from '@markless/compiler';
import type { NativeBuild } from './compile.ts';

type ExportAssignments = {
	readonly targets?: Readonly<
		Record<
			string,
			{
				readonly assignments?: ReadonlyArray<{
					readonly pageScroll?: unknown;
					readonly pageScrollUndecided?: {
						readonly nodeId: string;
						readonly detail: string;
					};
				}>;
			}
		>
	>;
};

/**
 * A styled page whose scroll range Dragon cannot decide is a build error naming the element, because the phone would otherwise
 * either refuse to open or lose the page's scrolling. One error per element, whichever targets and states it holds for.
 */
export function pageScrollDiagnostics(
	exported: ExportAssignments,
	build: Pick<NativeBuild, 'elementSources'>,
	filename: string,
): CompilerDiagnostic[] {
	const seen = new Map<string, { readonly detail: string; readonly targets: Set<string> }>();
	for (const [target, { assignments = [] } = {}] of Object.entries(exported.targets ?? {})) {
		for (const assignment of assignments) {
			if (assignment.pageScroll !== null) continue;
			const undecided = assignment.pageScrollUndecided;
			if (!undecided)
				throw new Error(
					`${filename}: the ${target} style export leaves the page's scroll range undecided without naming why`,
				);
			const entry = seen.get(undecided.nodeId) ?? {
				detail: undecided.detail,
				targets: new Set<string>(),
			};
			entry.targets.add(target);
			seen.set(undecided.nodeId, entry);
		}
	}
	return [...seen].map(([nodeId, { detail, targets }]): CompilerDiagnostic => {
		const source = build.elementSources.get(nodeId);
		const element = source ? `<${source.element}>` : `element ${nodeId}`;
		return {
			code: NATIVE_UNSUPPORTED_CODE,
			severity: 'error',
			phase: 'serialization',
			title: 'This page cannot scroll on a native target yet',
			message: `${source?.span?.filename ?? filename}: the page's scroll range cannot be decided because of ${element} (${nodeId}) on ${[...targets].join(' and ')}: ${detail}`,
			why: "A native page scrolls over the range Dragon computes from the page's layout; Dragon does not decide it with this element on the page.",
			...(source?.span ? { primarySpan: source.span } : {}),
			passId: 'native-view',
			suggestions: [],
			docsUrl: `https://markless.dev/errors/${NATIVE_UNSUPPORTED_CODE}`,
		};
	});
}
