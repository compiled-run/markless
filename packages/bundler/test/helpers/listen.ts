import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export function listenOnFreePort(server: Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve((server.address() as AddressInfo).port);
		});
	});
}
