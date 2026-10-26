import { decodeProtocolPayloadLists } from './protocol-record-templates.ts';

/** A streamed arm's patch, its record set's lists expanded in place. */
export function decodeStreamedArmPatch<T extends readonly [unknown, unknown] | null>(patch: T): T {
	if (patch?.[1]) decodeProtocolPayloadLists('markless/view', patch[1]);
	return patch;
}
