import { defineHandler } from 'nitro';
import { noteAfterNext } from '../server/counter.ts';

export default defineHandler(async (event, next) => {
	const response = await next();
	if (new URL(event.req.url).pathname === '/api/bump') noteAfterNext();
	return response;
});
