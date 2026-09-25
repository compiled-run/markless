// Runs outside the test runner: its module transform would rewrite the inline
// scripts the stream serializes from function source.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = process.argv[2];
const gate = Promise.withResolvers();
const streamed = Promise.withResolvers();
globalThis.__harborGate = gate.promise;
const entry = await import(pathToFileURL(resolve(dist, 'server-render/server.js')).href);

const server = createServer(async (request, response) => {
	const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
	if (path === '/') {
		response.setHeader('Content-Type', 'text/html;charset=utf-8');
		const stream = await entry.stream();
		response.write(`<!doctype html><html><head></head><body>${stream.shell}`);
		for await (const chunk of stream.appends()) response.write(chunk);
		response.end('</body></html>');
		streamed.resolve();
		return;
	}
	if (path === '/__settle') {
		gate.resolve();
		await streamed.promise;
		response.end('streamed');
		return;
	}
	try {
		const source = await readFile(resolve(dist, `.${path}`));
		response.setHeader('Content-Type', 'text/javascript');
		response.end(source);
	} catch {
		response.statusCode = 404;
		response.end();
	}
});
server.listen(0, '127.0.0.1', () => {
	process.stdout.write(`${server.address().port}\n`);
});
