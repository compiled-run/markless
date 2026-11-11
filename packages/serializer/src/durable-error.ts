// A live Error is not durable graph state; its name and message are, so a handled failure never fails the render.
export function durableError(error: unknown): unknown {
	if (error instanceof Error) {
		return { $type: 'error', name: error.name, message: error.message };
	}
	return error;
}
