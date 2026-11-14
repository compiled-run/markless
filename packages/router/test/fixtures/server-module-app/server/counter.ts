let count = 0;
let pageRequests = 0;

export function readCount(): number {
	return count;
}

export function bumpCount(): number {
	count += 1;
	return count;
}

export function notePageRequest(): void {
	pageRequests += 1;
}

export function readPageRequests(): number {
	return pageRequests;
}
