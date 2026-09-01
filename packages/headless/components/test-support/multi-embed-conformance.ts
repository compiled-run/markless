import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
// The instance-identity grammar itself, from the package that owns it. The
// "is this id bare" question is exactly `protocolInstancePath(id) === ''`, and
// restating the regex here would let the battery and the protocol drift.
// Reached by path because @markless/serializer is not a dependency of
// @markless/ui — the same reason ssr-plugin.ts reaches the router by path.
import {
	protocolInstancePath,
	protocolIslandSegment,
} from '../../../serializer/src/protocol-constants.ts';

/**
 * The multi-embed half of the family conformance gate. One page, N same-shape
 * embeds of one family, merged through the router's real composeMdxState /
 * composeMdxView — the shape an MDX docs page makes when it renders the same
 * demo five times. A family joins by calling `runMultiEmbedConformance` with a
 * descriptor; the checks below are the same code for every family, so an
 * isolation rule can never hold for one family by accident.
 *
 * CALLING CONVENTION — read this before writing a family's descriptor.
 *
 * The battery does NOT mount anything itself, and it cannot. The SSR island
 * lever is a marker rewritten by a STRING-LEVEL transform in
 * packages/vitest-browser/src/ssr-plugin.ts: it resolves each component
 * identifier against the import statements of the file the call is written in,
 * and rejects anything that is not an identifier imported from a `.tsrx`
 * module. A component handed to a shared helper as a parameter is invisible to
 * it. So the literal call lives in the FAMILY's own suite and the descriptor
 * carries a thunk:
 *
 *     import { renderSSRIslands } from '@markless/vitest-browser';
 *     import TabsIsland from './scenarios/multi-embed.tsrx';
 *     import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
 *
 *     runMultiEmbedConformance({
 *         family: 'accordion',
 *         render: () => renderSSRIslands([FaqIsland, FaqIsland]),
 *         embedFrame: 'frame',
 *         widgetDefinitionSuffixes: ['#accordionState'],
 *         interaction: {
 *             activate: 'shipping-trigger',
 *             stateAttribute: 'aria-expanded',
 *             restValue: 'false',
 *             activeValue: 'true',
 *         },
 *         rovingKey: '{ArrowDown}',
 *         rovingFrom: 'returns-trigger',
 *         disabled: { control: 'billing-trigger' },
 *     });
 *
 * The scenario module must be the WHOLE embed — one component that renders the
 * family once — because each entry in the array becomes its own island. Two
 * entries of the same module is the point: both islands spell identical
 * `c`/`p` instance paths, so only the host's `m<n>:` island segment can tell
 * their widget cells apart.
 *
 * EXPECTED PRE-FIX REDS. Before the island discriminator lands (the `m<n>:`
 * segment in PROTOCOL_INSTANCE_PATH plus its application across
 * composeMdxState / composeMdxView), checks (a)-(c) fail for every
 * widget-scoped family, with these signatures — any OTHER failure is a real
 * finding, not the known gap:
 *
 *   (a) distinct-widget-ids — `expected length 2, received 1` for a declared
 *       suffix: both embeds' definitions collapsed to one merged entry. A
 *       `received ''` from the instance-path assertion is the separate
 *       bare-widget-id defect (a widget-scoped `shared:` id that no registered
 *       widget root claimed), not the merge.
 *   (b) interaction-isolation — embed 1 reports `activeValue` after only embed
 *       0 was clicked: one cell behind both embeds.
 *   (c) focus-containment — activeElement lands inside embed 1's frame: the
 *       plural element handle merged into one roster across embeds.
 *
 * Checks (d) and (e) are expected GREEN pre-fix: a disabled control is guarded
 * at its own call site, and page scope is deliberately one cell per page.
 * Check (e) is the other half of the id rule — island discrimination must not
 * reach page-scoped `shared()`, so it stays singular by design.
 */

export type MultiEmbedCheckId =
	| 'distinct-widget-ids'
	| 'interaction-isolation'
	| 'focus-containment'
	| 'disabled-inert'
	| 'page-scope-shared';

export type MultiEmbedExemption = {
	readonly check: MultiEmbedCheckId;
	readonly reason: string;
};

/**
 * Mounts the composed multi-island page. Always a thunk wrapping a literal
 * `renderSSRIslands([...])` written in the caller's own file — see the calling
 * convention above. The return value is ignored; the battery reads the live
 * document, because the merged payload is only reachable there.
 */
export type EmbedRender = () => Promise<unknown>;

export type MultiEmbedInteraction = {
	/** Testid of the control that activates one item. Rendered once per embed. */
	readonly activate: string;
	/** Testid whose attribute reports the result. Defaults to `activate`. */
	readonly observe?: string;
	/** The attribute that reports open/checked/selected state. */
	readonly stateAttribute: string;
	/** Its value at rest. `null` means the attribute is absent at rest. */
	readonly restValue: string | null;
	/** Its value once activated. `null` means the attribute is absent once active. */
	readonly activeValue: string | null;
};

export type MultiEmbedDisabled = {
	/** Testid of a control the scenario renders disabled/locked, once per embed. */
	readonly control: string;
	/** Defaults to the interaction's state attribute. */
	readonly stateAttribute?: string;
};

export type MultiEmbedPageScope = {
	/** A thunk mounting N islands of a component that reads a page-scoped `shared()`. */
	readonly render: EmbedRender;
	/** Substring identifying the page-scoped cell in the merged payload. */
	readonly cellIdIncludes: string;
	/** Testid of the element displaying the shared value, once per embed. */
	readonly value: string;
	/** Testid of the control that writes it, once per embed. */
	readonly bump: string;
	/** The displayed value every embed must read after one write. */
	readonly afterBump: string;
};

export type MultiEmbedDescriptor = {
	/** The folder name under src/, used as the suite name and the coverage key. */
	readonly family: string;
	/** How many islands `render` mounts. Two is enough to witness a merge. */
	readonly embeds?: number;
	readonly render: EmbedRender;
	/** Testid of a per-embed wrapper element, rendered exactly once per embed. */
	readonly embedFrame: string;
	/**
	 * Widget definition id suffixes the family spells, e.g. `#accordionState`.
	 * Each must resolve to exactly one definition PER EMBED in the merged
	 * payload, all distinct and all carrying an instance path.
	 */
	readonly widgetDefinitionSuffixes: readonly string[];
	readonly interaction: MultiEmbedInteraction;
	/** The roving-focus key, e.g. `'{ArrowDown}'`. Omit when the family has no roving walk. */
	readonly rovingKey?: string;
	/**
	 * Testid to focus before pressing `rovingKey`. Point this at the LAST item
	 * in the walk: that is where a merged roster escapes into the next embed.
	 * Defaults to `interaction.activate`.
	 */
	readonly rovingFrom?: string;
	/** Omit when the family has no disabled concept. */
	readonly disabled?: MultiEmbedDisabled;
	/** Omit when the family's scenario reads no page-scoped shared cell. */
	readonly pageScoped?: MultiEmbedPageScope;
	readonly exemptions?: readonly MultiEmbedExemption[];
};

type StatePayload = {
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly sharedDefinitions?: ReadonlyArray<{
		readonly id: string;
		readonly scope?: string;
	}>;
};

// How long a check that expects NOTHING to change waits before saying so. Same
// order as the menu suite's quiet window: long enough for a handler module
// fetch plus a write to land, short enough not to dominate the lane.
const QUIET_MS = 800;

function statePayload(): StatePayload {
	const script = document.querySelector('script[type="markless/state"]');
	if (!script?.textContent) throw new Error('Expected a serialized markless/state payload.');
	return JSON.parse(script.textContent) as StatePayload;
}

function parts(testid: string, embeds: number): HTMLElement[] {
	const found = Array.from(
		document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
	);
	expect(found, `[data-testid="${testid}"] should render exactly once per embed`).toHaveLength(
		embeds,
	);
	return found;
}

function readState(element: Element, attribute: string): string | null {
	return element.getAttribute(attribute);
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runMultiEmbedConformance(descriptor: MultiEmbedDescriptor): void {
	const embeds = descriptor.embeds ?? 2;
	if (embeds < 2) {
		throw new Error(
			`${descriptor.family}: multi-embed conformance needs at least two embeds to witness a merge.`,
		);
	}

	describe(`${descriptor.family} multi-embed`, () => {
		const register = (check: MultiEmbedCheckId, title: string, body: () => Promise<void>) => {
			const exemption = (descriptor.exemptions ?? []).find((one) => one.check === check);
			if (!exemption) {
				test(title, body);
				return;
			}
			test.fails(`${title} — known gap: ${exemption.reason}`, body);
		};

		// (a) Each embed's widget is its own widget. Two same-shape embeds spell
		// identical compiler paths, so the merged payload can only keep them
		// apart by the host's island segment.
		register('distinct-widget-ids', 'each embed owns a distinct widget definition id', async () => {
			await descriptor.render();
			const definitions = statePayload().sharedDefinitions ?? [];

			for (const suffix of descriptor.widgetDefinitionSuffixes) {
				const ids = definitions.map((one) => one.id).filter((id) => id.endsWith(suffix));
				expect(ids, `${descriptor.family}: one "${suffix}" per embed`).toHaveLength(embeds);
				expect(new Set(ids).size, `${descriptor.family}: "${suffix}" ids repeat`).toBe(
					embeds,
				);
				for (const id of ids) {
					expect(protocolInstancePath(id), `bare widget id in the payload: ${id}`).not.toBe(
						'',
					);
				}
				for (let embed = 0; embed < embeds; embed++) {
					const segment = protocolIslandSegment(embed);
					expect(
						ids.filter((id) => protocolInstancePath(id).startsWith(segment)),
						`${descriptor.family}: exactly one "${suffix}" under island ${segment}`,
					).toHaveLength(1);
				}
			}

			// The family-agnostic half of the same rule: no widget-scoped id may
			// appear twice anywhere in the merged payload.
			const widgetIds = definitions
				.filter((one) => one.scope === 'widget')
				.map((one) => one.id);
			expect(new Set(widgetIds).size, 'widget-scoped ids collide across embeds').toBe(
				widgetIds.length,
			);
		});

		// (b) A gesture in one embed is a gesture in one embed.
		register('interaction-isolation', 'activating one embed leaves every other at rest', async () => {
			await descriptor.render();
			const { activate, observe, stateAttribute, restValue, activeValue } =
				descriptor.interaction;
			const controls = parts(activate, embeds);
			const observed = parts(observe ?? activate, embeds);

			await userEvent.click(controls[0]!);

			await expect
				.poll(() => readState(observed[0]!, stateAttribute))
				.toBe(activeValue);
			for (let embed = 1; embed < embeds; embed++) {
				expect(
					readState(observed[embed]!, stateAttribute),
					`embed ${embed} moved when embed 0 was activated`,
				).toBe(restValue);
			}
		});

		// (c) The roving walk reads a plural element handle, which is one roster
		// per rendered widget. A merged roster walks straight out of the embed
		// the key was pressed in.
		if (descriptor.rovingKey) {
			const rovingKey = descriptor.rovingKey;
			register('focus-containment', 'the roving key never moves focus out of its embed', async () => {
				await descriptor.render();
				const frames = parts(descriptor.embedFrame, embeds);
				const from = parts(
					descriptor.rovingFrom ?? descriptor.interaction.activate,
					embeds,
				);

				from[0]!.focus();
				await userEvent.keyboard(rovingKey);

				await expect
					.poll(() => frames[0]!.contains(document.activeElement))
					.toBe(true);
				for (let embed = 1; embed < embeds; embed++) {
					expect(
						frames[embed]!.contains(document.activeElement),
						`focus escaped into embed ${embed}`,
					).toBe(false);
				}
			});
		}

		// (d) Disabled is disabled in every embed, under a gesture aimed at any
		// of them — including one aimed at a sibling embed.
		if (descriptor.disabled) {
			const disabled = descriptor.disabled;
			register('disabled-inert', 'a disabled item never changes state from any embed', async () => {
				await descriptor.render();
				const attribute = disabled.stateAttribute ?? descriptor.interaction.stateAttribute;
				const locked = parts(disabled.control, embeds);
				const before = locked.map((one) => readState(one, attribute));

				for (const control of locked) await userEvent.click(control);
				await wait(QUIET_MS);

				expect(
					parts(disabled.control, embeds).map((one) => readState(one, attribute)),
					'a disabled item changed state',
				).toEqual(before);
			});
		}

		// (e) The other half of the id rule. Page scope means one cell for the
		// whole page, so island discrimination must not reach it: both embeds
		// still read one cell and see each other's writes.
		if (descriptor.pageScoped) {
			const pageScoped = descriptor.pageScoped;
			register('page-scope-shared', 'a page-scoped shared cell stays one cell across embeds', async () => {
				await pageScoped.render();
				const cellIds = (statePayload().cells ?? [])
					.map((cell) => cell.graphNodeId)
					.filter((id) => id.includes(pageScoped.cellIdIncludes));

				expect(cellIds.length, `no cell matched "${pageScoped.cellIdIncludes}"`).toBeGreaterThan(0);
				expect(new Set(cellIds).size, 'a page-scoped cell was split per embed').toBe(1);

				await userEvent.click(parts(pageScoped.bump, embeds)[0]!);

				await expect
					.poll(() => parts(pageScoped.value, embeds)[0]!.textContent?.trim())
					.toBe(pageScoped.afterBump);
				for (let embed = 1; embed < embeds; embed++) {
					expect(
						parts(pageScoped.value, embeds)[embed]!.textContent?.trim(),
						`embed ${embed} did not see the page-scoped write`,
					).toBe(pageScoped.afterBump);
				}
			});
		}
	});
}
