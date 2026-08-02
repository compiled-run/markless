import {
	decodePayloadScriptsWithVersion,
	payloadInvalidError,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
} from './protocol-client.ts';
import { validateStorageRecords } from './storage-record-client.ts';

export {
	payloadInvalidError,
	payloadScriptSelector,
	RuntimePayloadError,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from './protocol-client.ts';

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	const decoded = decodePayloadScriptsWithVersion(input, true);
	validateStorageRecords(decoded.state, payloadInvalidError);
	return decoded;
}
