import { decodeProtocolPayloadLists } from '@markless/serializer/record-templates';

type LocatorRoot = Element & { __marklessLocatorMisses?: Set<string> };

function servedIndex(r: LocatorRoot, hostNodeId: string): number | undefined {
	try {
		const view = decodeProtocolPayloadLists(
			'markless/view',
			JSON.parse(r.querySelector('script[type="markless/view"]')?.textContent || 'null'),
		) as { readonly locators?: ReadonlyArray<{ hostNodeId: string; index: number }> } | null;
		return view?.locators?.find((locator) => locator.hostNodeId === hostNodeId)?.index;
	} catch {
		return undefined;
	}
}

/**
 * Dev only, loaded on a miss: a lean dispatch that finds no element where a locator
 * points would otherwise read as "not our event". A slot the census repair emptied
 * is a foreign change the full resume already reports, so it is left to that report.
 */
export const marklessReportLocatorMiss = (
	r: LocatorRoot,
	l: { readonly hostNodeId: string; readonly tagName: string; readonly index?: number },
	found: Element | null | undefined,
) => {
	if (found === null) return;
	const reported = (r.__marklessLocatorMisses ??= new Set());
	if (reported.has(l.hostNodeId)) return;
	reported.add(l.hostNodeId);
	const index = l.index ?? servedIndex(r, l.hostNodeId);
	const code = found ? 'MARKLESS_RESUME_LOCATOR_MISMATCH' : 'MARKLESS_RESUME_LOCATOR_MISSING';
	const expected = `Resume locator ${l.hostNodeId} expected <${l.tagName.toLowerCase()}> at DOM order index ${index ?? '?'}`;
	const error = Object.assign(
		new Error(
			`${found ? `${expected} but found <${found.localName}>` : expected}. The page's elements no longer line up with what the server rendered, so this element's handlers and bindings do not run.`,
		),
		{ code, docsUrl: `https://markless.dev/errors/${code}` },
	);
	if (globalThis.reportError) globalThis.reportError(error);
	else console.error(error);
};
