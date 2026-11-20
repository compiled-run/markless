import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { ECHO_SERVER_PORT } from '../proofs/ladder.ts';
import { startEchoServer } from '../src/harness/echo-server.ts';

it('listens below every OS ephemeral port range, where no outgoing connection is handed its port', () => {
	expect(ECHO_SERVER_PORT).toBeGreaterThan(5000);
	expect(ECHO_SERVER_PORT).toBeLessThan(32768);
});

it('names the process holding its port when the port is taken', async () => {
	const holder = createServer();
	await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
	const { port } = holder.address() as AddressInfo;
	try {
		await expect(startEchoServer(port)).rejects.toThrow(
			new RegExp(`127\\.0\\.0\\.1:${port}: it is in use by [^]*\\b${process.pid}\\b`),
		);
	} finally {
		await new Promise<void>((resolve) => holder.close(() => resolve()));
	}
});
