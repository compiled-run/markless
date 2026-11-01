import { ASYNC_BOUNDARY_ARM } from './async-boundary-arm.ts';
import type { SerializedRecord } from './value.ts';
import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_VISIBLE_EVENT_NAME,
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
} from './protocol-constants.ts';

export {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_VISIBLE_EVENT_NAME,
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
};
export {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
	protocolInstancePath,
	PROTOCOL_PAGE_SPACE_ID_PREFIXES,
	protocolInstanceQualifies,
	protocolInstanceSegment,
	protocolProjectionSegment,
	protocolRowSegment,
} from './protocol-constants.ts';
export { PROTOCOL_CONTAINER_HOST_NODE_ID } from './protocol-page-markers.ts';
export {
	protocolBoundSymbolBase,
	protocolBoundSymbolBaseEnd,
	protocolBoundSymbolPrefix,
	protocolBoundSymbolSegment,
} from './protocol-constants.ts';
export {
	PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE,
	PROTOCOL_RAW_TEXT_TAGS,
	PROTOCOL_TEMPLATE_CONTENT_TAG,
} from './protocol-detached-content.ts';
export {
	constantSyncPolicyCode,
	formatEventHostEntries,
	parseEventHostEntries,
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_EVENT_HOST_DELEGATED_REF,
	PROTOCOL_EVENT_HOST_ENTRY_SEPARATOR,
	PROTOCOL_EVENT_HOST_POLICY_SEPARATOR,
	PROTOCOL_EVENT_HOST_REF_SEPARATOR,
	PROTOCOL_SYNC_POLICY_TABLE_TYPE,
	syncPolicyNeverActs,
	type ProtocolConstantSyncPolicyCode,
	type ProtocolEventHostEntry,
} from './protocol-event-host.ts';

export type ProtocolAsyncBoundaryArm = (typeof ASYNC_BOUNDARY_ARM)[keyof typeof ASYNC_BOUNDARY_ARM];

/**
 * Where an element sits below the node an address starts from, one step per
 * level. A step counts the parent's element children, and each @if, @switch or
 * @try block as one (its start comment, content and end comment together). Text
 * never counts, since adjacent text merges and an empty value renders no node,
 * so the server's HTML and a client-built tree read the same. A negative step
 * counts back from the end: -1 is the last.
 */
export type ProtocolElementAddress = ReadonlyArray<number>;

export type ProtocolSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<ProtocolSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<ProtocolSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: ProtocolSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly graphNodeId: string;
			readonly path?: ReadonlyArray<string>;
			/** When present, the read must equal this value rather than be truthy. */
			readonly equals?: string | number | boolean | null;
	  }
	| {
			readonly type: 'constant-truthy';
			readonly value: unknown;
	  }
	| {
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type ProtocolSyncPolicyBranch = {
	readonly when: ProtocolSyncPolicyCondition;
	readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
};

export type ProtocolSyncPolicy =
	| ProtocolSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<ProtocolSyncPolicyBranch>;
	  };

export type ProtocolEventActionKind =
	(typeof PROTOCOL_EVENT_ACTION_KIND)[keyof typeof PROTOCOL_EVENT_ACTION_KIND];

export type ProtocolEventAction = {
	readonly kind: typeof PROTOCOL_EVENT_ACTION_KIND.externalDelegate;
	readonly owner: string;
};

export type ProtocolEventRecord = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly syncPolicy?: ProtocolSyncPolicy;
	readonly symbolIds: ReadonlyArray<string>;
	readonly action?: ProtocolEventAction;
};

export function protocolEventActionKind(
	record: Pick<ProtocolEventRecord, 'action'>,
): ProtocolEventActionKind {
	return record.action?.kind ?? PROTOCOL_EVENT_ACTION_KIND.event;
}

export function protocolEventDispatchesMarkless(
	record: Pick<ProtocolEventRecord, 'action'>,
): boolean {
	return protocolEventActionKind(record) === PROTOCOL_EVENT_ACTION_KIND.event;
}

export type ProtocolStatePayload = {
	readonly version: typeof ASYNC_PROTOCOL_VERSION | typeof STORAGE_PROTOCOL_VERSION;
	readonly cells: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name: string;
		readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
		readonly value?: unknown;
		// Live-value channel (need 14): CSR mounts seed cells (page props) whose
		// value never crosses HTML, so it travels as-is instead of a serialized
		// envelope. Hosts serving a payload script must envelope-encode these via
		// serializeRuntimeStateCells first — payload decoding rejects the field.
		readonly directValue?: unknown;
	}>;
	readonly computed: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name: string;
		readonly async: boolean;
		// Sync computeds only: the update symbol that recomputes this node on resume.
		readonly deriveSymbolId?: string;
		// The value the render already derived, in the same envelope a cell value
		// uses. A resume only re-derives a sync computed when a dependency is
		// WRITTEN, so without this a handler reading one before the first write
		// answers undefined. Served only for computeds a handler reads.
		readonly value?: unknown;
		// The same value on the live channel cells use: a CSR mount hands it over
		// in memory, so it never needs an envelope. Never served — payload
		// decoding rejects it exactly as it rejects a cell's.
		readonly directValue?: unknown;
		readonly dependencies?: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		}>;
		readonly snapshot?:
			| {
					readonly status: 'idle';
					readonly version: 0;
			  }
			| {
					readonly status: 'pending';
					readonly version: number;
					readonly key: unknown;
			  }
			| {
					readonly status: 'fulfilled';
					readonly version: number;
					readonly key: unknown;
					readonly value: unknown;
			  }
			| {
					readonly status: 'rejected';
					readonly version: number;
					readonly key: unknown;
					readonly error: unknown;
			  };
		// A roster derive only: the host-id prefix of the component that declared it,
		// which its symbol-space id cannot spell once a module holds several components.
		readonly hostScope?: string;
		// Only subscriptions and other such computeds read it, so resume re-derives it
		// when it is read rather than on every dependency write.
		readonly deriveOnRead?: true;
	}>;
	// A shared node a component seeds from its own props. The node keeps its own
	// value (a part's write stands until the next prop moves), and these say which
	// prop reads the seed follows so a composing parent's write re-runs it.
	readonly sharedSeeds?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly deriveSymbolId: string;
		readonly dependencies: ReadonlyArray<{
			// Where the live value is: the node to watch, and the value to re-seed from.
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			// The read the seed's own symbol makes, which this route answers. Before
			// composition the two are the same read; composition moves the route onto
			// the parent's node and leaves this one on the child's own props.
			readonly reads: {
				readonly graphNodeId: string;
				readonly path: ReadonlyArray<string>;
			};
		}>;
	}>;
	readonly sharedDefinitions?: ReadonlyArray<{
		readonly id: string;
		readonly name: string;
		readonly exportedName: string;
		readonly scope?: 'request' | 'container' | 'page' | 'widget';
		readonly version: number;
		readonly graphNodeIds: ReadonlyArray<string>;
		readonly projectionIds?: ReadonlyArray<string>;
		readonly dependencies?: ReadonlyArray<{
			readonly definitionId: string;
			readonly definitionName: string;
		}>;
		readonly returnProperties?: ReadonlyArray<
			| {
					readonly kind: 'graph';
					readonly name: string;
					readonly graphNodeId: string;
					readonly path: ReadonlyArray<string>;
			  }
			| {
					readonly kind: 'method';
					readonly name: string;
			  }
		>;
	}>;
	readonly storage?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly key: string;
	}>;
	// Served form only: value records two or more envelopes hold, which decoding copies back into each.
	readonly sharedRecords?: ReadonlyArray<SerializedRecord>;
};

// D3 arm-relative coordinates: records inside an async boundary arm index
// from the boundary's start anchor (locator index 0 names the first element
// after it), so arms stay closed, movable, replaceable, streamable units.
// An arm locator carries no `strategy`: its record set already says arm-relative.
// Arm-scoped branch records resolve their anchors in the arm's own
// arm-branch comment census; escalated records carry no anchors.
export type ProtocolBranchContentRead = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly source: string;
};

/**
 * One prop a composed part's own arm-update symbol can read: the name the part
 * spells and the graph node the caller passed it. Only props with a live route
 * are listed; a name missing from the table was passed statically, so the value
 * the part mounted with is already its final one.
 */
export type ProtocolComposedGraphProp = {
	readonly name: string;
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
};

/**
 * The graph read id an arm-update symbol asks under for a minted element() id.
 *
 * A minted id is `idPrefix + handle` where the prefix is the rendered widget's
 * instance token, a seed-map value no flip can reach. The render that served the
 * arm resolves the id and files it on the branch record under this key; the
 * symbol asks for it through the read channel it already has, so the mint keeps
 * exactly one spelling. Resume matches the key as a SUFFIX of the id it is
 * handed, because a composed symbol's reads arrive with the instance path
 * prepended — that is why the key carries the namespace and not the bare handle.
 */
export function protocolElementHandleReadId(handleGraphNodeId: string): string {
	return `markless:element-handle-id|${handleGraphNodeId}`;
}

/**
 * One IDREF position naming a handle some branch arm binds. `armIndex` is the
 * arm that binds it: the attribute is earned exactly while that arm is the
 * painted one, which is the only test that also answers for an arm the render
 * already served and no flip ever re-materializes. `handleReadId` is the same
 * key the branch record's `elementHandleIds` uses.
 */
export type ProtocolBranchIdrefSite = {
	readonly hostNodeId: string;
	readonly attributeName: string;
	readonly handleReadId: string;
	readonly armIndex: number;
};

export type ProtocolArmBranchRecord = {
	readonly id: string;
	readonly testReads: ReadonlyArray<{
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly contentReads?: ReadonlyArray<ProtocolBranchContentRead>;
	readonly symbolId?: string;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	// A composed child's branch inside the arm keeps the `dom-order-comment`
	// anchors its own module counted; they name its comment text, not an index
	// into this arm's census.
	readonly startAnchor?: {
		readonly strategy: 'arm-branch-comment' | 'dom-order-comment';
		readonly index: number;
	};
	readonly endAnchor?: {
		readonly strategy: 'arm-branch-comment' | 'dom-order-comment';
		readonly index: number;
	};
	readonly armRecords?: NonNullable<ProtocolViewPayload['branches']>[number]['armRecords'];
	readonly composedInstancePath?: string;
	readonly composedGraphProps?: ReadonlyArray<ProtocolComposedGraphProp>;
};

export type ProtocolArmRecordSet = {
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: ProtocolViewPayload['events'];
	readonly domUpdates?: ProtocolViewPayload['domUpdates'];
	readonly behaviors: ProtocolViewPayload['behaviors'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
	readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
	readonly branches?: ReadonlyArray<ProtocolArmBranchRecord>;
	/** Served beside `events` sent as templates: the names the stream boot listens for. */
	readonly eventNames?: ReadonlyArray<string>;
};

// A streamed arm carries its served-arm discriminator beside the record set,
// avoiding a second snapshot scan during pre-resume adoption.
export type ProtocolStreamedArmPatch = readonly [
	arm: ProtocolAsyncBoundaryArm,
	records: ProtocolArmRecordSet,
];

/**
 * Where one row-template slot's value comes from: the repeated item, a graph
 * node the page already holds, or an authored expression.
 *
 * Exactly one of the three. `itemPath` is a property path off the item the mint
 * was handed. The `graphNodeId`/`graphPath` pair is a read of the page's own
 * state - a row spelling `name={list.name}`. `source` is an authored expression
 * - `\`Edit ${row.name}\``, `format(row.at)` - that the owning component's
 * render-data reader answers for the row, under the same key the server render
 * used; `reads` names the graph nodes outside the row it reads, omitted when none.
 *
 * A row rebuilds when any slot value moves: its item changed under its key, or a
 * graph node a slot reads was written.
 */
export type ProtocolRowTemplateSlotValue =
	| { readonly itemPath: ReadonlyArray<string> }
	| { readonly graphNodeId: string; readonly graphPath: ReadonlyArray<string> }
	| {
			readonly source: string;
			readonly reads?: ReadonlyArray<{
				readonly graphNodeId: string;
				readonly path: ReadonlyArray<string>;
			}>;
	  };

/** One arm of a row's branch: its markup and slots, FRAGMENT-relative to the arm's first node. */
export type ProtocolRowTemplateArm = {
	readonly html: string;
	readonly textSlots?: ReadonlyArray<
		{ readonly path: ReadonlyArray<number> } & ProtocolRowTemplateSlotValue
	>;
	readonly attributeSlots?: ReadonlyArray<
		{
			readonly path: ReadonlyArray<number>;
			readonly name: string;
		} & ProtocolRowTemplateSlotValue
	>;
};

export type ProtocolRowTemplateBranchSlot = {
	readonly path: ReadonlyArray<number>;
	readonly branchId: string;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly arms: ReadonlyArray<ProtocolRowTemplateArm>;
} & ProtocolRowTemplateSlotValue;

export type ProtocolViewPayload = {
	readonly version: typeof ASYNC_PROTOCOL_VERSION;
	// Async runner transport is independent from authored boundary reads. The
	// compiler emits the dependency closure needed to reconstruct the client
	// graph; optionality preserves protocol-v1 payloads with no async runners.
	readonly asyncRunners?: Readonly<Record<string, string>>;
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly strategy: 'dom-order';
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: ReadonlyArray<ProtocolEventRecord>;
	readonly domUpdates: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly target?:
			| {
					readonly kind: 'text';
					readonly prefix?: string;
					readonly suffix?: string;
					readonly trueValue?: string;
					readonly falseValue?: string;
					/**
					 * The host's child-node position of the one text node this write owns,
					 * present only when the text shares its element with other children.
					 * Negative counts back from the end: -1 is the last child node.
					 */
					readonly textNode?: number;
			  }
			| {
					readonly kind: 'attribute';
					readonly name: string;
			  }
			| {
					readonly kind: 'property';
					readonly name: string;
			  }
			| {
					readonly kind: 'class';
					readonly trueValue?: string;
					readonly falseValue?: string;
					/** Class names every write must keep — the module's style scope, which the runtime would otherwise overwrite. */
					readonly constantClass?: string;
					/** Class names every write keeps in front of the value — a part's own style scope, which its markup writes before the class its consumer handed it. */
					readonly leadingClass?: string;
			  }
			| {
					readonly kind: 'style';
			  };
		readonly symbolId?: string;
	}>;
	readonly behaviors: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly source: string;
		readonly functionSource: string;
		readonly inputSources: ReadonlyArray<string>;
		readonly inputValues?: ReadonlyArray<unknown>;
		readonly inputGraphReads?: ReadonlyArray<{
			readonly inputIndex: number;
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		}>;
		readonly symbolId?: string;
		/** The behavior reads or writes page state, so it runs against the page's graph. */
		readonly usesGraph?: true;
	}>;
	readonly elementHandles: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleId: string;
		readonly name: string;
		/** Declared `element<T[]>()`: this handle names an ordered set, and a read answers an array. */
		readonly plural?: boolean;
	}>;
	readonly keyedRepeats?: ReadonlyArray<{
		readonly id: string;
		readonly parentHostNodeId: string;
		/**
		 * Where the OWNER's own markup put the rows, when `parentHostNodeId` names
		 * an element the owner never wrote: a `@for` inside a child's `{children}`
		 * renders into the element that child wraps its hole in, so the parent above
		 * is the child's, and this is the host the projecting markup sat in. Only a
		 * reader that needs the owner's own id space reads it.
		 */
		readonly ownerHostNodeId?: string;
		/**
		 * The graph instance path of the component that AUTHORED this `@for`, as
		 * composition spells it (`c<n>:`/`p<n>:` segments, outermost first).
		 *
		 * A row key is only unique within one rendered repeat, and the repeat's own
		 * path is the only thing that tells two renderings of one `@for` apart: two
		 * family roots over ONE page-level collection read a collection node in page
		 * space, so a row keyed off the collection is spelled the same by both. The
		 * mint keys a minted row's segment on this plus the row key.
		 *
		 * Pay-per-use: a repeat the root module authored itself stands at no
		 * instance and omits the field, so its record is byte-identical to what it
		 * was before this existed. Only composition writes it.
		 */
		readonly instancePath?: string;
		/**
		 * Present on a `@for` written inside another `@for`'s row. Its rows render
		 * once per enclosing row, so the browser wires one instance of this record in
		 * each enclosing row. Its own parent has no single host, so `parentHostNodeId`
		 * names the outermost enclosing repeat's parent: whatever keeps or moves that
		 * repeat's record by host keeps or moves this one with it.
		 *
		 * `parentHostPath` walks from an enclosing row's root to this repeat's parent,
		 * ROW-ROOT-relative like `rowEvents[].hostPath`. `itemPath` is present when
		 * the collection is a path on the enclosing row's item (`group.items`); the
		 * collection then reads the outermost enclosing collection with a `'*'`
		 * segment for each enclosing row (`['*', 'items']`), which reads nothing on
		 * its own and which each instance replaces with its enclosing row's index.
		 * `repeatId` is spelled as the authoring module spells it: composition
		 * prefixes a record's `id` but not this, so it resolves under the record's
		 * own prefix.
		 *
		 * Pay-per-use: a repeat inside no other repeat omits the field.
		 */
		readonly enclosingRow?: {
			readonly repeatId: string;
			readonly parentHostPath: ProtocolElementAddress;
			readonly itemPath?: ReadonlyArray<string>;
		};
		readonly collectionGraphNodeId?: string;
		readonly collectionPath: ReadonlyArray<string>;
		readonly keyPath: ReadonlyArray<string>;
		/**
		 * `key i`: a row's key is its position, not a value read off the item.
		 * Pay-per-use: a repeat keyed by item data omits the field.
		 */
		readonly indexKey?: true;
		/**
		 * Rows written straight into an `@if`/`@switch` arm or an `@try`/`@pending`/
		 * `@catch` arm, with no element of the arm around them: they stand between
		 * that range's anchors, and only while `arm` is the one shown. `branchId` is
		 * the branch site or async boundary id as the authoring module spells it;
		 * composition prefixes it the way it prefixes this record's `id`.
		 */
		readonly branchArm?: { readonly branchId: string; readonly arm: number };
		readonly itemName: string;
		/**
		 * The `index` name of the `@for`, which a row handler reading it is handed
		 * beside the item. Pay-per-use: present only when a row handler reads it.
		 */
		readonly indexName?: string;
		readonly rowElementCount: number;
		/**
		 * Element children of the parent that stand before the rows. Rows occupy
		 * `[rowStartOffset, rowStartOffset + items.length)` among the parent's child
		 * elements; a repeat whose rows begin at 0 omits the field. A repeat whose
		 * prefix has no compile-time element count says `rowEndOffset` instead, or
		 * ships no record at all when its suffix has none either.
		 */
		readonly rowStartOffset?: number;
		/**
		 * Element children of the parent that stand after the rows, set only when
		 * the prefix has no compile-time element count. Rows then occupy the
		 * `items.length` element children ending `rowEndOffset` before the last.
		 */
		readonly rowEndOffset?: number;
		/**
		 * The browser can never change these rows: the collection and every value a
		 * row shows are fixed once the page is served, so the record carries no row
		 * markup and resume neither follows the collection nor loads row-building
		 * code. Pay-per-use: a repeat whose rows can change omits the field.
		 */
		readonly fixed?: true;
		/**
		 * The `@empty` arm's finished markup, for the mint that raises it when the
		 * collection empties after resume and takes it back out when a row returns.
		 * Carried only for a repeat that HAS an `@empty` arm whose markup is fully
		 * static and whose elements no record names: everything else would need
		 * wiring the mint cannot do, so it ships nothing and the served behaviour
		 * stands. A repeat with no `@empty` arm omits the field entirely.
		 */
		readonly emptyArm?: { readonly html: string };
		/**
		 * One row's compiled markup, for the mint that builds a row the server never
		 * rendered - an item appended to the collection after resume.
		 *
		 * `html` is the row chunk's statics joined, slot markers KEPT: the marker
		 * comments are where the row's own text lives, so the mint finds each text
		 * position by walking to it rather than by re-parsing. `textSlots` names
		 * those positions - `path` is FRAGMENT-relative (`[0]` is the row root),
		 * the value channel is `ProtocolRowTemplateSlotValue` - and is omitted
		 * when the row has none, which is the fully static row.
		 *
		 * `attributeSlots` names the row's dynamic attributes the same way, with the
		 * attribute `name` to write and a `path` addressing the ELEMENT that carries
		 * it. The attribute's value is not in the html at all: the statics join
		 * around it, and the mint writes it under the presence rule every other
		 * render path uses (absent for null, undefined and false).
		 *
		 * Carried only for a row the client can finish alone: static markup, or
		 * markup whose every slot - text or attribute - reads off the repeated item,
		 * off the items of the rows enclosing it, off a graph node the page already
		 * holds, or off an authored expression over those and the owning
		 * component's props (a `source` slot, `class` and `style` included; the
		 * html keeps a slot attribute's static part, such as the scope class). A row
		 * holding anything else - an element handle's id, a value only the render
		 * produces, a nested construct - needs wiring the mint cannot do, so it
		 * ships nothing and the served behaviour stands. One child component is the exception: a
		 * row element wrapping one is markup here plus identity in `rowComponent`,
		 * whose `slotPath` names the marker in this html the child's rendered nodes
		 * replace.
		 *
		 * Pay-per-use: a repeat whose row is not mintable emits no field at all, so
		 * its record is byte-identical to what it was before this existed, and a row
		 * with no dynamic attributes omits `attributeSlots` for the same reason.
		 */
		readonly rowTemplate?: {
			readonly html: string;
			/** The component whose render-data reader answers `source` slots; present exactly when one is. */
			readonly componentName?: string;
			readonly textSlots?: ReadonlyArray<
				{ readonly path: ReadonlyArray<number> } & ProtocolRowTemplateSlotValue
			>;
			readonly attributeSlots?: ReadonlyArray<
				{
					readonly path: ReadonlyArray<number>;
					readonly name: string;
				} & ProtocolRowTemplateSlotValue
			>;
			/**
			 * An `@if`/`@switch` written in the row, flipped per row. The slot value is
			 * the test (the discriminant for a `@switch`, matched against `armTests`),
			 * and `path` names the marker in `html` the shown arm's anchors and nodes
			 * replace. A branch that IS the row (`@for { @if { <tr> } }`) has the marker
			 * as the whole html: its arm is the row root, so a flip rebuilds the row.
			 * `branchId` is the branch site as the anchor comments spell it, before
			 * composition's prefix, like `branchArm.branchId`.
			 *
			 * Pay-per-use: a row with no such branch omits the field.
			 */
			readonly branchSlots?: ReadonlyArray<ProtocolRowTemplateBranchSlot>;
		};
		/**
		 * The parent graph node each prop a `rowTemplate` source slot reads follows,
		 * by prop name. The owning component's reader reads a prop under the
		 * child's own id, which holds the served value; the row reads the node the
		 * parent passed instead. Only composition writes it, and only for a prop
		 * passed as a live graph reference.
		 *
		 * Pay-per-use: a row reading no routed prop omits the field.
		 */
		readonly propRoutes?: ReadonlyArray<{
			readonly name: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		}>;
		/**
		 * The component a row of this repeat roots, named by identity alone.
		 *
		 * A child component cannot ship markup the way `rowTemplate` does: it has a
		 * graph, not a template, and one instance per rendered row. So this carries
		 * identifiers and nothing else - the client builds the row by running the
		 * same one-edge render the server ran, under ids qualified by the row's key.
		 *
		 * `componentName` is the component that OWNS the edge (the one whose markup
		 * holds the `@for`), not the child: the child's name already rides on the
		 * edge. `itemPropName` is the prop the row's item crosses under, carried
		 * only when exactly one prop is the bare `@for` binding.
		 *
		 * `slotPath` appears when a row ELEMENT wraps the component rather than the
		 * row being the component. The wrapper's markup then rides in `rowTemplate`,
		 * and this FRAGMENT-relative path (`[0]` is the row root) names the marker
		 * comment inside it that the child's rendered nodes replace. Its absence is
		 * the row that IS the component, which has no wrapper and ships no
		 * `rowTemplate` - the shape this field had before wrappers were minted, so
		 * such a record stays byte-identical.
		 *
		 * Carried only for a key-identified repeat whose row start is known and
		 * whose child is declared in the same module; anything else is refused, so
		 * the served behaviour stands and the record is byte-identical.
		 *
		 * `rowChunkId` replaces `componentEdgeId` for a row whose markup an @if or
		 * @switch over the row item picks: the client renders that owner chunk
		 * whole, the way the server did, instead of one edge.
		 */
		readonly rowComponent?: {
			readonly componentEdgeId?: string;
			readonly componentName: string;
			readonly itemPropName?: string;
			readonly slotPath?: ReadonlyArray<number>;
			readonly rowChunkId?: string;
		};
		readonly rowElementHandles?: ReadonlyArray<{
			readonly hostPath: ProtocolElementAddress;
			readonly handleId: string;
			readonly name: string;
			readonly plural?: boolean;
		}>;
		readonly rowEvents: ReadonlyArray<{
			readonly hostPath: ProtocolElementAddress;
			readonly eventName: string;
			readonly symbolIds: ReadonlyArray<string>;
			readonly syncPolicy?: ProtocolSyncPolicy;
			/**
			 * The event's host sits in arm `arm` of `rowTemplate.branchSlots[slot]`, so it
			 * exists only while that arm shows, and `hostPath` is ARM-relative: element
			 * index among the arm's nodes, then child-node indexes from there.
			 */
			readonly arm?: { readonly slot: number; readonly arm: number };
		}>;
	}>;
	readonly branches?: ReadonlyArray<{
		readonly id: string;
		readonly startAnchor: { readonly strategy: 'dom-order-comment'; readonly index: number };
		readonly endAnchor: { readonly strategy: 'dom-order-comment'; readonly index: number };
		readonly symbolId?: string;
		readonly armTests?: ReadonlyArray<unknown>;
		readonly armRecords?: ReadonlyArray<{
			readonly events: ReadonlyArray<{
				readonly hostPath: ProtocolElementAddress;
				readonly eventName: string;
				readonly symbolIds: ReadonlyArray<string>;
				readonly syncPolicy?: ProtocolSyncPolicy;
				readonly action?: ProtocolEventAction;
			}>;
			readonly domUpdates: ReadonlyArray<Record<string, unknown>>;
			readonly behaviors: ReadonlyArray<Record<string, unknown>>;
			readonly elementHandles: ReadonlyArray<Record<string, unknown>>;
		}>;
		readonly testReads?: ReadonlyArray<{
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		}>;
		/**
		 * Reads an arm renders with no element of its own to bind to. Writing one
		 * through an element update would erase both arms' markers, so these
		 * refresh the arm's own marker range through the branch's update symbol.
		 */
		readonly contentReads?: ReadonlyArray<ProtocolBranchContentRead>;
		/**
		 * Marks a branch whose arms hold a component that has to run, so a flip
		 * re-renders the page through the prerender evaluator instead of rebuilding
		 * markup from `armRecords`. Absent on every branch the compiler could build
		 * arm parts for, which keeps those payloads byte-identical.
		 */
		readonly escalates?: true;
		/**
		 * Arm-relative records for the arm THIS render served, moved out of the
		 * page-absolute streams. Only an escalating branch carries one; `armRecords`
		 * above stays the compiler's per-arm plan for every other branch.
		 */
		readonly servedArmRecords?: ProtocolArmRecordSet;
		/**
		 * The instance path of the part that authored this branch, present on
		 * every branch that travelled through composition and absent on every
		 * branch that did not. An arm's own update symbol reads the part-local
		 * prop ids its module spells, and only the two fields here say which
		 * instance it is running as and where its props now live: the record's
		 * `testReads`/`contentReads` were rewritten to the caller's nodes, but
		 * the symbol's own read has no other route.
		 */
		readonly composedInstancePath?: string;
		readonly composedGraphProps?: ReadonlyArray<ProtocolComposedGraphProp>;
		/**
		 * Minted element() ids for the handles this branch's arms bind, resolved by
		 * the render that served the branch. The token they were minted from is a
		 * seed-map value, so a flip has no second way to spell them. Keyed by
		 * `protocolElementHandleReadId`, the whole read id the arm symbol asks
		 * under, so the resume side answers by matching a key it was handed rather
		 * than re-deriving the namespace. Absent on every branch whose arms bind no
		 * handle an IDREF names, which keeps those payloads byte-identical.
		 */
		readonly elementHandleIds?: Readonly<Record<string, string>>;
		/**
		 * IDREF positions OUTSIDE the arms that name a handle an arm binds. The
		 * element they sit on outlives the flip, so the attribute is written when
		 * the arm files its handle and removed when the arm takes it away, rather
		 * than served naming an element that is not there.
		 */
		readonly idrefSites?: ReadonlyArray<ProtocolBranchIdrefSite>;
	}>;
	readonly asyncBoundaries: ReadonlyArray<{
		readonly id: string;
		readonly runnerGraphNodeId: string | null;
		readonly initiallyServedArm: ProtocolAsyncBoundaryArm;
		readonly updateSymbolId?: string;
		// A single set is the armized truth for the arm the render actually
		// served (SSR compose / arm-render modules); an array is the compiler's
		// per-arm plan (index 0 = @try, 1 = @pending, 2 = @catch), which is not
		// positionally trustworthy after composition and is never registrable.
		readonly armRecords?: ProtocolArmRecordSet | ReadonlyArray<ProtocolArmRecordSet>;
		readonly startAnchor: {
			readonly strategy: 'dom-order-comment';
			readonly index: number;
		};
		readonly endAnchor: {
			readonly strategy: 'dom-order-comment';
			readonly index: number;
		};
		readonly asyncReads: ReadonlyArray<{
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly runnerSymbolId?: string;
		}>;
		/** As on a branch: the part instance that authored this boundary and where its live props now live, for the arm its own module re-renders on settle. */
		readonly composedInstancePath?: string;
		readonly composedGraphProps?: ReadonlyArray<ProtocolComposedGraphProp>;
	}>;
};

export type ProtocolPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly stateScript: string;
	readonly viewScript: string;
};

/**
 * A record list served as templates. `t` holds each distinct record shape as JSON text whose
 * per-record values are `^<slot>` holes, whose instance paths are `` `<slot> `` holes naming an
 * entry of the payload's `instancePaths`, and whose field names the list's generated key table
 * spells are `~<index>:` references; each `r` entry is a template index (no values), a
 * `[template, ...values]` row filling the holes in order, or a record no other record shares.
 */
export type ProtocolTemplatedRecords = {
	readonly t: ReadonlyArray<string>;
	readonly r: ReadonlyArray<number | ReadonlyArray<number | string> | object>;
};

/**
 * The instance paths a payload's templated lists name, as `instancePaths`: each entry is a path,
 * or `[parent, segments]`, the path of entry `parent` followed by `segments`.
 */
export type ProtocolInstancePaths = ReadonlyArray<string | readonly [number, string]>;

/** A record list as a payload script serves it: a plain array, or templates. */
export type ProtocolServedRecords = ReadonlyArray<unknown> | ProtocolTemplatedRecords;
