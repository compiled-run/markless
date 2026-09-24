import fs from 'node:fs';

// Minimal JSON Schema subset: type (incl. arrays/null), required, properties, additionalProperties,
// items, enum, const, minimum, maximum, anyOf/oneOf, local $ref (#/$defs|definitions/...).
export function loadSchema(path) {
	if (!fs.existsSync(path)) return null;
	return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

export function validate(schema, value, root = schema, at = '$') {
	if (schema === true || schema === undefined) return [];
	if (schema === false) return [`${at}: disallowed`];
	if (schema.$ref) {
		const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
		if (!target) return [`${at}: unresolved $ref ${schema.$ref}`];
		return validate(target, value, root, at);
	}
	const errors = [];
	if (schema.type) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		const t = typeOf(value);
		if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${at}: expected ${types.join('|')}, got ${t}`];
	}
	if (schema.const !== undefined && value !== schema.const) errors.push(`${at}: expected const ${JSON.stringify(schema.const)}`);
	if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} not in enum`);
	if (typeof value === 'number') {
		if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: < minimum ${schema.minimum}`);
		if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: > maximum ${schema.maximum}`);
	}
	for (const key of ['anyOf', 'oneOf']) {
		if (!schema[key]) continue;
		const passing = schema[key].filter((s) => validate(s, value, root, at).length === 0).length;
		if (key === 'anyOf' ? passing === 0 : passing !== 1) errors.push(`${at}: ${key} matched ${passing}`);
	}
	if (typeOf(value) === 'object') {
		for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}.${key}: required`);
		for (const [key, v] of Object.entries(value)) {
			if (schema.properties?.[key] !== undefined) errors.push(...validate(schema.properties[key], v, root, `${at}.${key}`));
			else if (schema.additionalProperties === false) errors.push(`${at}.${key}: additional property`);
			else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, root, `${at}.${key}`));
		}
	}
	if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, root, `${at}[${i}]`)));
	return errors;
}
