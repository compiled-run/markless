// Own module: browser resume imports the instance-path grammar and nothing else of the protocol.
const PROTOCOL_INSTANCE_SEGMENT = /[cpm]\d+:|r:[^:]*:/g;
const PROTOCOL_INSTANCE_PATH = /^(?:[cpm]\d+:|r:[^:]*:)+/;

export const PROTOCOL_PROP_GRAPH_NODE_PREFIX = 'prop:';

/** The leading instance path of a composed id, or '' when the id is page-local. */
export function protocolInstancePath(id: string): string {
	return PROTOCOL_INSTANCE_PATH.exec(id)?.[0] ?? '';
}

/** For each `r:<key>:` segment of `id`, the instance path of the component whose row it is. */
export function protocolRowOwnerPaths(id: string): string[] {
	const owners: string[] = [];
	let path = '';
	for (const [segment] of protocolInstancePath(id).matchAll(PROTOCOL_INSTANCE_SEGMENT)) {
		if (segment.startsWith('r:')) owners.push(path);
		path += segment;
	}
	return owners;
}
