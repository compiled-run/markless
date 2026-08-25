import { ASYNC_BOUNDARY_ARM } from './async-boundary-arm.ts';
import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
} from './protocol-constants.ts';

export {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
};
export {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
	protocolInstancePath,
	PROTOCOL_PAGE_SPACE_ID_PREFIXES,
	protocolInstanceQualifies,
	protocolInstanceSegment,
	protocolProjectionSegment,
	protocolRowSegment,
} from './protocol-constants.ts';

export type ProtocolAsyncBoundaryArm = (typeof ASYNC_BOUNDARY_ARM)[keyof typeof ASYNC_BOUNDARY_ARM];

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
};

// D3 arm-relative coordinates: records inside an async boundary arm index
// from the boundary's start anchor (locator index 0 names the first element
// after it), so arms stay closed, movable, replaceable, streamable units.
// Arm-scoped branch records resolve their anchors in the arm's own
// arm-branch comment census; escalated records carry no anchors.
export type ProtocolBranchContentRead = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly source: string;
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
	readonly startAnchor?: { readonly strategy: 'arm-branch-comment'; readonly index: number };
	readonly endAnchor?: { readonly strategy: 'arm-branch-comment'; readonly index: number };
	readonly armRecords?: NonNullable<ProtocolViewPayload['branches']>[number]['armRecords'];
};

export type ProtocolArmRecordSet = {
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly strategy: 'arm-relative';
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: ProtocolViewPayload['events'];
	readonly domUpdates?: ProtocolViewPayload['domUpdates'];
	readonly behaviors: ProtocolViewPayload['behaviors'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
	readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
	readonly branches?: ReadonlyArray<ProtocolArmBranchRecord>;
};

// A streamed arm carries its served-arm discriminator beside the record set,
// avoiding a second snapshot scan during pre-resume adoption.
export type ProtocolStreamedArmPatch = readonly [
	arm: ProtocolAsyncBoundaryArm,
	records: ProtocolArmRecordSet,
];

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
		readonly collectionGraphNodeId?: string;
		readonly collectionPath: ReadonlyArray<string>;
		readonly keyPath: ReadonlyArray<string>;
		readonly itemName: string;
		readonly rowElementCount: number;
		/**
		 * Element children of the parent that stand before the rows. Rows occupy
		 * `[rowStartOffset, rowStartOffset + items.length)` among the parent's child
		 * elements; a repeat whose rows begin at 0 omits the field. A repeat whose
		 * prefix has no compile-time element count ships no record at all.
		 */
		readonly rowStartOffset?: number;
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
		 * `itemPath` is the property path to read off the item - and is omitted
		 * when the row has none, which is the fully static row.
		 *
		 * `attributeSlots` names the row's dynamic attributes the same way, with the
		 * attribute `name` to write and a `path` addressing the ELEMENT that carries
		 * it. The attribute's value is not in the html at all: the statics join
		 * around it, and the mint writes it from the item under the presence rule
		 * every other render path uses (absent for null, undefined and false).
		 *
		 * Carried only for a row the client can finish alone: static markup, or
		 * markup whose every slot - text or attribute - reads off the repeated item.
		 * A row holding anything else - a value from outside the row, an attribute
		 * value computed by an expression, a nested construct, a component - needs
		 * wiring the mint cannot do, so it ships nothing and the served behaviour
		 * stands.
		 *
		 * Pay-per-use: a repeat whose row is not mintable emits no field at all, so
		 * its record is byte-identical to what it was before this existed, and a row
		 * with no dynamic attributes omits `attributeSlots` for the same reason.
		 */
		readonly rowTemplate?: {
			readonly html: string;
			readonly textSlots?: ReadonlyArray<{
				readonly path: ReadonlyArray<number>;
				readonly itemPath: ReadonlyArray<string>;
			}>;
			readonly attributeSlots?: ReadonlyArray<{
				readonly path: ReadonlyArray<number>;
				readonly name: string;
				readonly itemPath: ReadonlyArray<string>;
			}>;
		};
		/**
		 * The component a row of this repeat roots, named by identity alone.
		 *
		 * A row whose whole content is a child component cannot ship markup the way
		 * `rowTemplate` does: the component has a graph, not a template, and one
		 * instance per rendered row. So this carries three identifiers and nothing
		 * else - the client builds the row by running the same one-edge render the
		 * server ran, under ids qualified by the row's key.
		 *
		 * `componentName` is the component that OWNS the edge (the one whose markup
		 * holds the `@for`), not the child: the child's name already rides on the
		 * edge. `itemPropName` is the prop the row's item crosses under, carried
		 * only when exactly one prop is the bare `@for` binding.
		 *
		 * Carried only for a key-identified repeat whose row start is known and
		 * whose child is declared in the same module; anything else is refused, so
		 * the served behaviour stands and the record is byte-identical.
		 */
		readonly rowComponent?: {
			readonly componentEdgeId: string;
			readonly componentName: string;
			readonly itemPropName?: string;
		};
		readonly rowElementHandles?: ReadonlyArray<{
			readonly hostPath: ReadonlyArray<number>;
			readonly handleId: string;
			readonly name: string;
			readonly plural?: boolean;
		}>;
		readonly rowEvents: ReadonlyArray<{
			readonly hostPath: ReadonlyArray<number>;
			readonly eventName: string;
			readonly symbolIds: ReadonlyArray<string>;
			readonly syncPolicy?: ProtocolSyncPolicy;
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
				readonly hostPath: ReadonlyArray<number>;
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
	}>;
};

export type ProtocolPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly stateScript: string;
	readonly viewScript: string;
};
