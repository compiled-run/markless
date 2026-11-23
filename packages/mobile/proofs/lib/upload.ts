/** What a multipart/form-data body the echo server read back holds: each entry as name=value, a file as name=filename:text. */
export function describeUpload(echo: string): string {
	const [method = '', , contentType = ''] = echo.split(' ');
	const parts = echo.split('Content-Disposition: form-data; ').slice(1);
	const entries = parts.map((part) => {
		const after = (label: string) => {
			const at = part.indexOf(`${label}="`);
			if (at < 0) return undefined;
			const start = at + label.length + 2;
			return part.slice(start, part.indexOf('"', start));
		};
		const text = part.slice(part.indexOf('\r\n\r\n') + 4, part.indexOf('\r\n--'));
		const file = after('filename');
		return file === undefined ? `${after('name')}=${text}` : `${after('name')}=${file}:${text}`;
	});
	return `${method} ${contentType.startsWith('multipart/form-data;') ? 'multipart' : contentType} ${entries.join(' ')}`;
}
