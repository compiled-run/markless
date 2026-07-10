import { MARKLESS_ARM_SCRIPT_TYPE, MARKLESS_VIEW_SCRIPT_TYPE } from '@markless/serializer';
import {
	MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR, MARKLESS_DEBUG_INTERACTION_KIND_NONE,
	MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION, MARKLESS_DEBUG_SOURCE_CALLBACK_PROP,
	MARKLESS_DEBUG_SOURCE_STREAMED_ARM,
} from '@markless/web';
import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export interface PayloadEventClaim {
	readonly containerId: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly symbolIds: readonly string[];
	readonly source: 'view' | typeof MARKLESS_DEBUG_SOURCE_STREAMED_ARM;
	readonly boundaryId?: string;
}

export interface ChannelEventRegistration {
	readonly containerId: string;
	readonly hostNodeId?: string;
	readonly eventName: string;
	readonly kind: string;
	readonly source?: string;
}

export interface PayloadWiringEvaluation {
	readonly invariant: AnalyzerCanonicalInvariantResult;
	/** Non-exempt registrations without payload claims. */
	readonly runtimeOnly: readonly ChannelEventRegistration[];
}

export function parsePayloadEventClaims(input: {
	readonly containerId: string;
	readonly viewScript?: string | null;
	readonly armScripts?: readonly { readonly boundaryId: string; readonly content: string }[];
}): PayloadEventClaim[] {
	const claims: PayloadEventClaim[] = [];
	if (input.viewScript) {
		const view = parseObject(input.viewScript, MARKLESS_VIEW_SCRIPT_TYPE);
		claims.push(...readRecordSet(view, input.containerId, 'view'));
		const boundaries = optionalArray(
			view.asyncBoundaries,
			`${MARKLESS_VIEW_SCRIPT_TYPE}.asyncBoundaries`,
		);
		for (const [index, value] of boundaries.entries()) {
			const boundary = asObject(value, `${MARKLESS_VIEW_SCRIPT_TYPE}.asyncBoundaries[${index}]`);
			// Arrays are compiler plans, not the served/registrable arm shape.
			if (boundary.armRecords && !Array.isArray(boundary.armRecords)) {
				const boundaryId = readString(
					boundary.id,
					`${MARKLESS_VIEW_SCRIPT_TYPE}.asyncBoundaries[${index}].id`,
				);
				claims.push(
					...readRecordSet(
						asObject(
							boundary.armRecords,
							`${MARKLESS_VIEW_SCRIPT_TYPE}.asyncBoundaries[${index}].armRecords`,
						),
						input.containerId,
						'view',
						boundaryId,
					),
				);
			}
		}
	}
	for (const arm of input.armScripts ?? []) {
		claims.push(
			...readRecordSet(
				parseObject(arm.content, `${MARKLESS_ARM_SCRIPT_TYPE}[${arm.boundaryId}]`),
				input.containerId,
				MARKLESS_DEBUG_SOURCE_STREAMED_ARM,
				arm.boundaryId,
			),
		);
	}
	return claims;
}

export function reconcilePayloadWiring(
	claims: readonly PayloadEventClaim[],
	registrations: readonly ChannelEventRegistration[],
): PayloadWiringEvaluation {
	const key = (value: { containerId: string; hostNodeId?: string; eventName: string }) =>
		`${value.containerId}\n${value.hostNodeId ?? ''}\n${value.eventName}`;
	const confirmed = new Set(
		registrations
			.filter((entry) => entry.kind !== MARKLESS_DEBUG_INTERACTION_KIND_NONE)
			.map(key),
	);
	const claimed = new Set(claims.map(key));
	const missing = claims.filter((claim) => !confirmed.has(key(claim)));
	const runtimeOnly = registrations.filter(
		(registration) =>
			registration.kind !== MARKLESS_DEBUG_INTERACTION_KIND_NONE &&
			!claimed.has(key(registration)) &&
			!runtimeGenerated(registration),
	);
	return {
		invariant: {
			id: 'MLA-S2-PAYLOAD-WIRING',
			status: missing.length || runtimeOnly.length ? 'fail' : 'pass',
			details: [
				...missing.map(
					(claim) =>
						`${claim.containerId}: payload claims ${claim.eventName} on ${claim.hostNodeId} but the runtime channel did not confirm it`,
				),
				...runtimeOnly.map(
					(entry) =>
						`${entry.containerId}: runtime registered ${entry.eventName} on ${entry.hostNodeId ?? 'unknown-host'} without a payload claim (${entry.kind})`,
				),
			],
		},
		runtimeOnly,
	};
}

function runtimeGenerated(registration: ChannelEventRegistration): boolean {
	return (
		registration.kind === MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR ||
		registration.kind === MARKLESS_DEBUG_SOURCE_CALLBACK_PROP ||
		registration.kind === MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION ||
		registration.source === MARKLESS_DEBUG_SOURCE_CALLBACK_PROP
	);
}

function readRecordSet(
	recordSet: Record<string, unknown>,
	containerId: string,
	source: PayloadEventClaim['source'],
	boundaryId?: string,
): PayloadEventClaim[] {
	return requiredArray(recordSet.events, `${source}.events`).map((value, index) => {
		const event = asObject(value, `${source}.events[${index}]`);
		const symbolIds = requiredArray(
			event.symbolIds,
			`${source}.events[${index}].symbolIds`,
		).map((value, symbolIndex) =>
			readString(value, `${source}.events[${index}].symbolIds[${symbolIndex}]`),
		);
		return {
			containerId,
			hostNodeId: readString(event.hostNodeId, `${source}.events[${index}].hostNodeId`),
			eventName: readString(event.eventName, `${source}.events[${index}].eventName`),
			symbolIds,
			source,
			...(boundaryId ? { boundaryId } : {}),
		};
	});
}

function parseObject(content: string, label: string): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch {
		throw new Error(`Invalid ${label}: expected JSON script content.`);
	}
	return asObject(value, label);
}
function asObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`Invalid ${label}: expected object.`);
	return value as Record<string, unknown>;
}
function requiredArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`Invalid ${label}: expected array.`);
	return value;
}
function optionalArray(value: unknown, label: string): unknown[] {
	return value === undefined ? [] : requiredArray(value, label);
}
function readString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0)
		throw new Error(`Invalid ${label}: expected nonempty string.`);
	return value;
}
