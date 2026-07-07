import { isEventAttribute } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { itemPathReadSource } from './source-expressions.ts';
import { emitCsrComponent, emitSsrComponent, objectPropertyName } from './component-wiring.ts';
import { joinSsrExpressions } from './shared.ts';
import type { CsrRenderContext, HtmlRenderContext, SsrRenderContext } from './types.ts';

export function emitHtmlNode(node: AnyNode, context: HtmlRenderContext): string {
	if (isStaticTextNode(node)) return JSON.stringify(staticTextValue(node));

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		const expression = node.expression as AnyNode | undefined;
		if (!expression) return '""';
		// Children placement is an opaque template projection: the prop carries
		// compiler-rendered HTML from the parent edge, so it interpolates raw.
		// Escaping it would turn projected markup into visible text.
		if (
			context.hasChildrenProp &&
			expressionSource(expression, context.source) === 'children'
		) {
			return `${renderHelper(context, 'ChildrenHtml')}(children)`;
		}
		return `${renderHelper(context, 'Text')}(${expressionSource(expression, context.source)})`;
	}

	if (node.type === 'JSXIfExpression') {
		const test = node.test as AnyNode | undefined;
		const testSource = `(${test ? expressionSource(test, context.source) : 'false'})`;
		if (context.mode === 'csr') {
			const csrSite = context.branchSites?.[context.nextBranchSiteIndex ?? 0];
			if (context.branchSites) {
				context.nextBranchSiteIndex = (context.nextBranchSiteIndex ?? 0) + 1;
			}
			const csrGate = csrSite
				? context.branchReactivityGates?.find((item) => item.branchSiteId === csrSite.id)
				: undefined;
			// Arm-scoped flip content is branch-owned: its hosts re-register per
			// flip through the branch record, so they never carry the arm-host
			// tag that would claim them for the boundary's own locators.
			const csrArmFlip =
				!!csrSite && csrGate?.supported === true && csrGate.armScoped === true && csrGate.armFlip === true;
			const armHostIdByNode = context.armHostIdByNode;
			if (csrArmFlip) context.armHostIdByNode = undefined;
			const ternary = `(${testSource} ? ${emitHtmlBranch(node.consequent as AnyNode | undefined, context)} : ${emitHtmlBranch(node.alternate as AnyNode | undefined, context)})`;
			if (csrArmFlip) context.armHostIdByNode = armHostIdByNode;
			if (csrSite && csrGate?.supported && csrGate.armScoped !== true) {
				// The CSR-built DOM carries the same anchors, so the same resume
				// runtime flips the range on the live graph (arm seeds from reads).
				return joinSsrExpressions([
					JSON.stringify(`<!--markless:branch:${csrSite.id}-->`),
					ternary,
					JSON.stringify(`<!--/markless:branch:${csrSite.id}-->`),
				]);
			}
			if (csrArmFlip && csrSite) {
				// Arm-branch anchors live in the owning boundary's own comment
				// census; the page-level census never counts them.
				return joinSsrExpressions([
					JSON.stringify(`<!--markless:arm-branch:${csrSite.id}-->`),
					ternary,
					JSON.stringify(`<!--/markless:arm-branch:${csrSite.id}-->`),
				]);
			}
			return ternary;
		}

		const site = context.branchSites[context.nextBranchSiteIndex++];
		const gate = site
			? context.branchReactivityGates.find((item) => item.branchSiteId === site.id)
			: undefined;
		const before = {
			nextChildIndex: context.nextChildIndex,
			nextComponentEdgeIndex: context.nextComponentEdgeIndex,
		};
		// armScoped @if arms (inside an async boundary arm) keep real host
		// locators: their hosts live in the boundary's arm-relative coordinate
		// space, so the compose step can move only the rendered ternary side's
		// records into boundary.armRecords (D3 — retires need 15 dead events).
		// Flip-planned arm-scoped sites (armFlip) are branch-owned instead: the
		// branch record re-registers their hosts per flip, so they render
		// locator-free like top-level branch arms.
		const consequentContext: SsrRenderContext = {
			...context,
			insideSupportedBranchArm:
				context.insideSupportedBranchArm ||
				(!!gate?.supported && (gate.armScoped !== true || gate.armFlip === true)),
		};
		const consequent = emitHtmlBranch(
			node.consequent as AnyNode | undefined,
			consequentContext,
		);
		// Child/component counters reset per arm (one arm renders at runtime);
		// semantic-order counters continue sequentially across arms so nested
		// sites keep their document-order alignment.
		const alternateContext = {
			...consequentContext,
			nextChildIndex: before.nextChildIndex,
			nextComponentEdgeIndex: before.nextComponentEdgeIndex,
		};
		const alternate = emitHtmlBranch(node.alternate as AnyNode | undefined, alternateContext);
		context.nextChildIndex = Math.max(
			consequentContext.nextChildIndex,
			alternateContext.nextChildIndex,
		);
		context.nextComponentEdgeIndex = Math.max(
			consequentContext.nextComponentEdgeIndex,
			alternateContext.nextComponentEdgeIndex,
		);
		context.nextRepeatIndex = alternateContext.nextRepeatIndex;
		context.nextAsyncBoundaryIndex = alternateContext.nextAsyncBoundaryIndex;
		context.nextBranchSiteIndex = alternateContext.nextBranchSiteIndex;

		if (site && gate?.supported && gate.armScoped !== true) {
			// Anchors always materialize; only the taken arm renders between them.
			return joinSsrExpressions([
				JSON.stringify(`<!--markless:branch:${site.id}-->`),
				`(${testSource} ? ${joinSsrExpressions([
					`marklessSsrBranchArm(marklessSsrBranches, ${JSON.stringify(site.id)}, 0)`,
					consequent,
				])} : ${joinSsrExpressions([
					`marklessSsrBranchArm(marklessSsrBranches, ${JSON.stringify(site.id)}, 1)`,
					alternate,
				])})`,
				JSON.stringify(`<!--/markless:branch:${site.id}-->`),
			]);
		}
		if (site && gate?.supported && gate.armScoped === true && gate.armFlip === true) {
			// D1 tier 3 inside arms: the anchor pair lives in the owning
			// boundary's own arm-branch census — the page census never sees it,
			// and the resume runtime seeds the arm from live graph reads.
			return joinSsrExpressions([
				JSON.stringify(`<!--markless:arm-branch:${site.id}-->`),
				`(${testSource} ? ${consequent} : ${alternate})`,
				JSON.stringify(`<!--/markless:arm-branch:${site.id}-->`),
			]);
		}
		return `(${testSource} ? ${consequent} : ${alternate})`;
	}

	if (node.type === 'JSXSwitchExpression') {
		return emitSwitchHtml(node, context);
	}

	if (node.type === 'JSXForExpression') {
		return context.mode === 'ssr'
			? emitSsrRepeatRows(node, context)
			: emitCsrRepeatRows(node, context);
	}

	if (node.type === 'JSXTryExpression') {
		// CSR mount is a local demand: the same anchors + @pending emit
		// synchronously and the runner settles the range after creation.
		return emitAsyncBoundaryHtml(node, context);
	}

	if (node.type === 'JSXStyleElement') return '""';

	if (node.type === 'ExpressionStatement') {
		const expression = node.expression as AnyNode | undefined;
		return expression ? emitHtmlNode(expression, context) : '""';
	}

	if (node.type !== 'Element' && node.type !== 'JSXElement') {
		return emitHtmlChildren(node, context);
	}

	const tagName = getElementTagName(node);
	if (!tagName) return emitDynamicTagHtml(node, context);
	if (!isHostTagName(tagName)) {
		return context.mode === 'ssr'
			? emitSsrComponent(node, tagName, context)
			: emitCsrComponent(node, tagName, context);
	}
	const hostLocator = context.mode === 'ssr' ? ssrHostLocator(node, tagName, context) : '""';
	// Arm-render modules tag static in-arm hosts; the module strips the
	// attribute after deriving arm-relative locators from the rendered truth.
	const armHostAttribute =
		context.mode === 'csr' && context.armHostIdByNode?.get(node)
			? ` data-markless-arm-host="${context.armHostIdByNode.get(node)}"`
			: '';

	const scopeClass = context.styleScopeClass ?? null;

	if (getElementAttributes(node).some(isSpreadAttribute)) {
		return joinSsrExpressions([
			hostLocator,
			JSON.stringify(`<${tagName}${armHostAttribute}`),
			`${renderHelper(context, 'SpreadAttributes')}({ ${mergedAttributeEntries(node, context.source).join(', ')} }, ${JSON.stringify(scopeClass)})`,
			JSON.stringify('>'),
			emitHtmlChildren(node, context),
			JSON.stringify(`</${tagName}>`),
		]);
	}

	const open = [`<${tagName}${armHostAttribute}`];
	const dynamicAttributes: string[] = [];
	let scopeClassHandled = scopeClass === null;
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') continue;
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const scopeSuffix = name === 'class' && scopeClass ? ` ${scopeClass}` : '';
		if (scopeSuffix) scopeClassHandled = true;
		if (!value) {
			open.push(` ${name}="${scopeSuffix.trim()}"`);
		} else if (value.type === 'Literal' && typeof value.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(value.value))}${scopeSuffix}"`);
		} else if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(expression.value))}${scopeSuffix}"`);
		} else if (expression) {
			const valueSource = scopeSuffix
				? `((marklessClassValue) => (marklessClassValue == null ? "" : String(marklessClassValue)) + ${JSON.stringify(scopeSuffix)})(${expressionSource(expression, context.source)})`
				: expressionSource(expression, context.source);
			dynamicAttributes.push(
				`${renderHelper(context, 'Attribute')}(${JSON.stringify(name)}, ${valueSource})`,
			);
		}
	}
	if (!scopeClassHandled && scopeClass) open.push(` class="${scopeClass}"`);

	const openExpression =
		dynamicAttributes.length === 0
			? [JSON.stringify(`${open.join('')}>`)]
			: [JSON.stringify(open.join('')), ...dynamicAttributes, JSON.stringify('>')];

	return joinSsrExpressions([
		hostLocator,
		...openExpression,
		emitHtmlChildren(node, context),
		JSON.stringify(`</${tagName}>`),
	]);
}

function ssrHostLocator(node: AnyNode, tagName: string, context: SsrRenderContext): string {
	// Row instances repeat per item, so a single dom-order locator cannot name
	// them yet; branch/list locator streams own that later. Rows render without
	// locators and marklessSsrRepeatRows shifts the indexes of later hosts.
	if (context.insideRepeatRow) return '""';
	if (context.insideSupportedBranchArm) {
		return 'marklessSsrArmHost(marklessSsrHostLocators)';
	}
	const hostNodeId = context.hostIdByNode.get(node);
	return hostNodeId
		? `marklessSsrHost(marklessSsrHostLocators, ${JSON.stringify(hostNodeId)}, ${JSON.stringify(tagName)})`
		: '""';
}

// Emits SSR html for a supported keyed repeat by mapping the live collection
// through the authored row template. Bails to the empty string (the prior
// behavior) whenever the row shape is not a single all-host-element subtree.
function emitSsrRepeatRows(node: AnyNode, context: SsrRenderContext): string {
	const repeat = context.keyedRepeats[context.nextRepeatIndex++];
	if (!repeat) {
		// No plan exists for this authored @for — today that means it sits inside
		// an async boundary arm, which repeat planning does not yet traverse
		// (dashboard-migration ledger need 6). Fail loudly: silently dropping
		// authored rows cost a full debugging session.
		throw new Error(
			'MARKLESS_REPEAT_UNPLANNED: @for inside an @try/@pending/@catch boundary is not supported yet. ' +
			'Move the repeat outside the async arm or lift the resolved data into page scope.',
		);
	}
	const gate = context.repeatGates.find((item) => item.repeatId === repeat.id);
	if (!gate?.supported) return '""';
	// Component-composed pages render rows too: the SSR row mapper appends row
	// locators through the same marklessSsrHostLocators stream that child
	// composition consumes, so ordering holds (proven by the
	// component-wrapped-rows browser fixture — dashboard-migration need 6).

	const row = singleRepeatRowElement(node);
	if (!row || !isPlainHostTemplateNode(row)) return '""';

	// The @empty branch renders at most once, so it emits with the normal
	// context: its locators push only when the branch is actually taken.
	const emptyBlock = node.empty as AnyNode | undefined;
	const emptyChildren = emptyBlock
		? asNodes(emptyBlock.body).filter((child) => !isIgnorableTextNode(child))
		: [];
	if (emptyChildren.some((child) => !isPlainHostTemplateNode(child))) return '""';

	const rowContext: SsrRenderContext = { ...context, insideRepeatRow: true };
	const rowHtml = emitHtmlNode(row, rowContext);
	const rowParams = repeat.indexName
		? `(${repeat.itemName}, ${repeat.indexName})`
		: `(${repeat.itemName})`;
	const emptyThunk =
		emptyChildren.length > 0
			? `() => ${joinSsrExpressions(emptyChildren.map((child) => emitHtmlNode(child, context)))}`
			: 'null';
	return `marklessSsrRepeatRows(marklessSsrHostLocators, ${repeat.collectionSource}, ${repeat.itemName} => ${itemPathReadSource(repeat.itemName, repeat.keyPath)}, ${JSON.stringify(repeat.id)}, ${JSON.stringify(repeat.itemName)}, ${JSON.stringify(repeat.keyPath)}, ${rowParams} => ${rowHtml}, ${countRowElements(row)}, ${emptyThunk})`;
}

// Supported async boundaries emit their payload-planned comment anchors.
// SSR awaits the demanded async computed inline (renderSsr is async) and
// renders the resolved @try or @catch arm between the anchors; boundaries
// without a runner, and the CSR string path, render @pending — the browser
// runtime settles that range after creation.
function emitAsyncBoundaryHtml(node: AnyNode, context: HtmlRenderContext): string {
	if (!context.asyncBoundaries || context.nextAsyncBoundaryIndex === undefined) return '""';
	const boundary = context.asyncBoundaries[context.nextAsyncBoundaryIndex++];
	// Nested boundaries never render, but their indexes must stay consumed so
	// later boundaries keep matching the payload arena's document order.
	context.nextAsyncBoundaryIndex += countDescendantBoundaries(node);
	if (!boundary) return '""';
	const gate = context.asyncBoundaryGates?.find((item) => item.boundaryId === boundary.id);
	if (!gate?.supported) return '""';

	const pendingChildren = asNodes((node.pending as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	const pendingHtml = joinSsrExpressions(
		pendingChildren.map((child) => emitHtmlNode(child, context)),
	);
	const runner = context.mode === 'ssr' ? context.asyncRunners?.get(boundary.id) : undefined;
	if (context.mode === 'ssr' && runner) {
		// v1 initial render awaits demanded async nodes and serves the settled
		// arm; the payload snapshot lets resume start zero runners (spec 03/06).
		const tryChildren = asNodes((node.block as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const tryHtml = joinSsrExpressions(
			tryChildren.map((child) => emitHtmlNode(child, context)),
		);
		const handler = node.handler as AnyNode | undefined;
		const catchChildren = asNodes((handler?.body as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const catchHtml = joinSsrExpressions(
			catchChildren.map((child) => emitHtmlNode(child, context)),
		);
		const catchParam =
			getIdentifierName(handler?.param as AnyNode | undefined) ?? 'marklessSsrAsyncError';
		return joinSsrExpressions([
			JSON.stringify(`<!--markless:async:${boundary.id}-->`),
			`(await ((async (marklessSsrAsyncSnapshot) => marklessSsrAsyncSnapshot.status === "fulfilled" ? (async (${runner.name}) => ${tryHtml})(marklessSsrAsyncSnapshot.value) : (async (${catchParam}) => ${catchHtml})(marklessSsrAsyncSnapshot.error))(await marklessSsrRunAsyncComputed(marklessSsrAsyncSnapshots, ${JSON.stringify(runner.graphNodeId)}, ${runner.source}))))`,
			JSON.stringify(`<!--/markless:async:${boundary.id}-->`),
		]);
	}
	return joinSsrExpressions([
		JSON.stringify(`<!--markless:async:${boundary.id}-->`),
		pendingHtml,
		JSON.stringify(`<!--/markless:async:${boundary.id}-->`),
	]);
}

// The runner's authored async function, keyed by the boundary that demands
// it. SSR awaits it inline; state locals put its free reads in scope.
export function collectSsrAsyncRunners(
	input: PublicRenderModuleInput,
): ReadonlyMap<
	string,
	{ readonly graphNodeId: string; readonly name: string; readonly source: string }
> {
	const runnersByGraphNode = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-computed-runner'
				? [[symbol.graphNodeId, { name: symbol.name, source: symbol.source }] as const]
				: [],
		),
	);
	const byBoundary = new Map<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>();
	for (const boundary of input.protocolView.asyncBoundaries) {
		const read = boundary.asyncReads[0];
		const runner = read ? runnersByGraphNode.get(read.graphNodeId) : undefined;
		if (read && runner) {
			byBoundary.set(boundary.id, { graphNodeId: read.graphNodeId, ...runner });
		}
	}
	return byBoundary;
}

function countDescendantBoundaries(node: AnyNode): number {
	return childNodes(node).reduce(
		(total, child) =>
			total + (child.type === 'JSXTryExpression' ? 1 : 0) + countDescendantBoundaries(child),
		0,
	);
}

// CSR string emission for supported keyed repeats. Unlike SSR there is no
// locator-index bookkeeping: CSR composition resolves hosts through authored
// child paths, and supported repeat parents contain only the repeat, so row
// insertion cannot shift any sibling path.
function emitCsrRepeatRows(node: AnyNode, context: CsrRenderContext): string {
	if (!context.keyedRepeats || !context.repeatGates) return '""';
	const repeat = context.keyedRepeats[context.nextRepeatIndex ?? 0];
	context.nextRepeatIndex = (context.nextRepeatIndex ?? 0) + 1;
	if (!repeat) return '""';
	const gate = context.repeatGates.find((item) => item.repeatId === repeat.id);
	if (!gate?.supported) return '""';

	const row = singleRepeatRowElement(node);
	if (!row || !isPlainHostTemplateNode(row)) return '""';

	const emptyBlock = node.empty as AnyNode | undefined;
	const emptyChildren = emptyBlock
		? asNodes(emptyBlock.body).filter((child) => !isIgnorableTextNode(child))
		: [];
	if (emptyChildren.some((child) => !isPlainHostTemplateNode(child))) return '""';

	// Rows repeat per item, so a single arm-relative locator cannot name them:
	// row instances never carry the arm-host tag (the keyed-repeat machinery
	// owns row records) — mirror of the SSR insideRepeatRow discipline.
	const armHostIdByNode = context.armHostIdByNode;
	context.armHostIdByNode = undefined;
	const rowHtml = emitHtmlNode(row, context);
	context.armHostIdByNode = armHostIdByNode;
	const rowParams = repeat.indexName
		? `(${repeat.itemName}, ${repeat.indexName})`
		: `(${repeat.itemName})`;
	const emptyThunk =
		emptyChildren.length > 0
			? `() => ${joinSsrExpressions(emptyChildren.map((child) => emitHtmlNode(child, context)))}`
			: 'null';
	return `marklessCsrRepeatRows(${repeat.collectionSource}, ${repeat.itemName} => ${itemPathReadSource(repeat.itemName, repeat.keyPath)}, ${JSON.stringify(repeat.id)}, ${JSON.stringify(repeat.itemName)}, ${JSON.stringify(repeat.keyPath)}, ${rowParams} => ${rowHtml}, ${emptyThunk})`;
}

function singleRepeatRowElement(node: AnyNode): AnyNode | null {
	const children = asNodes((node.body as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	const [row] = children;
	if (children.length !== 1 || !row) return null;
	return row.type === 'Element' || row.type === 'JSXElement' ? row : null;
}

function countRowElements(node: AnyNode): number {
	const isElement = node.type === 'Element' || node.type === 'JSXElement' ? 1 : 0;
	return asNodes(node.children).reduce(
		(total, child) => total + countRowElements(child),
		isElement,
	);
}

// Dynamic <{expr}> tags resolve the tag value at render time. The runtime
// helper is the XSS gate: it rejects non-tag-name strings before any string
// concatenation, renders nothing for nullish/false/empty values, and (SSR)
// counts the rendered element so later dom-order locators stay correct.
function emitDynamicTagHtml(node: AnyNode, context: HtmlRenderContext): string {
	const tagExpression = getDynamicTagExpression(node);
	if (!tagExpression) return '""';

	const attributeEntries = mergedAttributeEntries(node, context.source);
	const dynamicScopeClass = context.styleScopeClass ?? null;
	const attributesExpression =
		attributeEntries.length > 0 || dynamicScopeClass
			? `${renderHelper(context, 'SpreadAttributes')}({ ${attributeEntries.join(', ')} }, ${JSON.stringify(dynamicScopeClass)})`
			: '""';
	const tagValueExpression =
		context.mode === 'ssr'
			? `marklessSsrDynamicTagName(${expressionSource(tagExpression, context.source)})`
			: `marklessCsrDynamicTagName(${expressionSource(tagExpression, context.source)})`;
	// Rendered dynamic elements claim a real dom-order locator carrying the
	// runtime tag, so events/attach/el on them resolve like any host element.
	const dynamicHostId = context.mode === 'ssr' ? context.hostIdByNode.get(node) : undefined;
	const dynamicHostLocator =
		context.mode === 'ssr' && dynamicHostId && !context.insideRepeatRow
			? `marklessSsrHost(marklessSsrHostLocators, ${JSON.stringify(dynamicHostId)}, marklessDynamicTag)`
			: '""';

	return `((marklessDynamicTag) => marklessDynamicTag ? ${joinSsrExpressions([
		dynamicHostLocator,
		'("<" + marklessDynamicTag)',
		attributesExpression,
		JSON.stringify('>'),
		emitHtmlChildren(node, context),
		'("</" + marklessDynamicTag + ">")',
	])} : "")(${tagValueExpression})`;
}

// @switch renders as one IIFE binding the discriminant once (so getters and
// calls are not re-evaluated per case) around a strict-equality ternary chain.
// No matching case and no @default renders nothing, matching @if's untaken
// branch behavior.
function emitSwitchHtml(node: AnyNode, context: HtmlRenderContext): string {
	const site = context.branchSites?.[context.nextBranchSiteIndex ?? 0];
	if (context.branchSites) {
		context.nextBranchSiteIndex = (context.nextBranchSiteIndex ?? 0) + 1;
	}
	const siteGate = site
		? context.branchReactivityGates?.find((item) => item.branchSiteId === site.id)
		: undefined;
	const discriminant = node.discriminant as AnyNode | undefined;
	const discriminantSource = `(${discriminant ? expressionSource(discriminant, context.source) : 'undefined'})`;

	const before =
		context.mode === 'ssr'
			? {
					nextChildIndex: context.nextChildIndex,
					nextComponentEdgeIndex: context.nextComponentEdgeIndex,
				}
			: null;
	let maxChildIndex = before?.nextChildIndex ?? 0;
	let maxComponentEdgeIndex = before?.nextComponentEdgeIndex ?? 0;

	const switchArmFlip =
		!!site && siteGate?.supported === true && siteGate.armScoped === true && siteGate.armFlip === true;
	const emitCaseBody = (switchCase: AnyNode): string => {
		const children = asNodes(switchCase.consequent);
		if (context.mode === 'csr' || !before) {
			// Arm-scoped flip content is branch-owned (see the @if CSR note).
			const armHostIdByNode = context.armHostIdByNode;
			if (switchArmFlip) context.armHostIdByNode = undefined;
			const csrBody = joinSsrExpressions(children.map((child) => emitHtmlNode(child, context)));
			if (switchArmFlip) context.armHostIdByNode = armHostIdByNode;
			return csrBody;
		}
		const caseContext: SsrRenderContext = {
			...context,
			...before,
			// armScoped @switch cases keep real host locators (see the @if arm
			// note): the boundary's armRecords own their coordinates. Flip-planned
			// cases are branch-owned and render locator-free instead.
			insideSupportedBranchArm:
				(context as SsrRenderContext).insideSupportedBranchArm ||
				(!!siteGate?.supported && (siteGate.armScoped !== true || siteGate.armFlip === true)),
		};
		const body = joinSsrExpressions(children.map((child) => emitHtmlNode(child, caseContext)));
		maxChildIndex = Math.max(maxChildIndex, caseContext.nextChildIndex);
		maxComponentEdgeIndex = Math.max(maxComponentEdgeIndex, caseContext.nextComponentEdgeIndex);
		return body;
	};

	let defaultBody = '""';
	const testedCases: Array<{ readonly testSource: string; readonly body: string }> = [];
	for (const switchCase of asNodes(node.cases)) {
		const test = switchCase.test as AnyNode | undefined;
		const body = emitCaseBody(switchCase);
		if (!test) {
			defaultBody = body;
			continue;
		}
		testedCases.push({ testSource: expressionSource(test, context.source), body });
	}

	if (context.mode === 'ssr' && before) {
		context.nextChildIndex = maxChildIndex;
		context.nextComponentEdgeIndex = maxComponentEdgeIndex;
	}

	let expression = defaultBody;
	for (const testedCase of [...testedCases].reverse()) {
		expression = `(marklessSwitchValue === (${testedCase.testSource}) ? ${testedCase.body} : ${expression})`;
	}
	const chain = `((marklessSwitchValue) => ${expression})(${discriminantSource})`;
	if (site && siteGate?.supported && siteGate.armScoped !== true) {
		return joinSsrExpressions([
			JSON.stringify(`<!--markless:branch:${site.id}-->`),
			chain,
			JSON.stringify(`<!--/markless:branch:${site.id}-->`),
		]);
	}
	if (site && switchArmFlip) {
		// Arm-branch anchors: counted only in the owning boundary's own census.
		return joinSsrExpressions([
			JSON.stringify(`<!--markless:arm-branch:${site.id}-->`),
			chain,
			JSON.stringify(`<!--/markless:arm-branch:${site.id}-->`),
		]);
	}
	return chain;
}

function emitHtmlBranch(node: AnyNode | undefined, context: HtmlRenderContext): string {
	if (!node) return '""';
	if (node.type === 'BlockStatement') {
		return joinSsrExpressions(asNodes(node.body).map((child) => emitHtmlNode(child, context)));
	}
	return emitHtmlNode(node, context);
}

export function emitHtmlChildren(node: AnyNode, context: HtmlRenderContext): string {
	return joinSsrExpressions(
		asNodes(node.children ?? node.body).map((child) => emitHtmlNode(child, context)),
	);
}

function renderHelper(
	context: HtmlRenderContext,
	helper: 'Attribute' | 'ChildrenHtml' | 'SpreadAttributes' | 'Text',
): string {
	return `markless${context.mode === 'ssr' ? 'Ssr' : 'Csr'}${helper}`;
}

// Elements with a spread merge every attribute into one object so JS object
// semantics decide override order; the runtime helper renders the merged entries.
function mergedAttributeEntries(node: AnyNode, source: string): string[] {
	return getElementAttributes(node).flatMap((attribute) => {
		if (isSpreadAttribute(attribute)) {
			const argument = attribute.argument as AnyNode | undefined;
			return argument ? [`...(${expressionSource(argument, source)})`] : [];
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return [];
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) return [`${objectPropertyName(name)}: true`];
		if (value.type === 'Literal') {
			return [`${objectPropertyName(name)}: ${JSON.stringify(value.value)}`];
		}
		if (expression)
			return [`${objectPropertyName(name)}: ${expressionSource(expression, source)}`];
		return [];
	});
}
