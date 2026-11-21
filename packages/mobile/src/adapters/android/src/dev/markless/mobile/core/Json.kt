package dev.markless.mobile.core

class MarklessDecodeError(message: String) : RuntimeException(message)

sealed interface Json {
	data class Obj(val fields: LinkedHashMap<String, Json>) : Json
	data class Arr(val items: List<Json>) : Json
	data class Str(val value: String) : Json
	data class Num(val value: Double) : Json
	data class Bool(val value: Boolean) : Json
	data object Null : Json

	companion object {
		fun parse(bytes: ByteArray): Json = Parser(String(bytes, Charsets.UTF_8)).document()
		fun parse(text: String): Json = Parser(text).document()
	}
}

private class Parser(private val s: String) {
	private var i = 0

	fun document(): Json {
		val v = value()
		space()
		if (i != s.length) fail("trailing data")
		return v
	}

	private fun fail(what: String): Nothing = throw MarklessDecodeError("invalid JSON at offset $i: $what")

	private fun space() {
		while (i < s.length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++
	}

	private fun value(): Json {
		space()
		if (i >= s.length) fail("unexpected end")
		return when (s[i]) {
			'{' -> obj()
			'[' -> arr()
			'"' -> Json.Str(str())
			't' -> word("true", Json.Bool(true))
			'f' -> word("false", Json.Bool(false))
			'n' -> word("null", Json.Null)
			else -> num()
		}
	}

	private fun word(w: String, v: Json): Json {
		if (!s.startsWith(w, i)) fail("expected $w")
		i += w.length
		return v
	}

	private fun obj(): Json {
		i++
		val fields = LinkedHashMap<String, Json>()
		space()
		if (i < s.length && s[i] == '}') { i++; return Json.Obj(fields) }
		while (true) {
			space()
			if (i >= s.length || s[i] != '"') fail("expected key")
			val k = str()
			if (fields.containsKey(k)) fail("duplicate key $k")
			space()
			if (i >= s.length || s[i] != ':') fail("expected :")
			i++
			fields[k] = value()
			space()
			if (i >= s.length) fail("unexpected end")
			if (s[i] == ',') { i++; continue }
			if (s[i] == '}') { i++; return Json.Obj(fields) }
			fail("expected , or }")
		}
	}

	private fun arr(): Json {
		i++
		val items = ArrayList<Json>()
		space()
		if (i < s.length && s[i] == ']') { i++; return Json.Arr(items) }
		while (true) {
			items.add(value())
			space()
			if (i >= s.length) fail("unexpected end")
			if (s[i] == ',') { i++; continue }
			if (s[i] == ']') { i++; return Json.Arr(items) }
			fail("expected , or ]")
		}
	}

	private fun str(): String {
		i++
		val b = StringBuilder()
		while (true) {
			if (i >= s.length) fail("unterminated string")
			val c = s[i++]
			when {
				c == '"' -> return b.toString()
				c == '\\' -> {
					if (i >= s.length) fail("bad escape")
					when (val e = s[i++]) {
						'"' -> b.append('"'); '\\' -> b.append('\\'); '/' -> b.append('/')
						'b' -> b.append('\b'); 'f' -> b.append('\u000C'); 'n' -> b.append('\n')
						'r' -> b.append('\r'); 't' -> b.append('\t')
						'u' -> {
							if (i + 4 > s.length) fail("bad unicode escape")
							b.append(s.substring(i, i + 4).toIntOrNull(16)?.toChar() ?: fail("bad unicode escape"))
							i += 4
						}
						else -> fail("bad escape \\$e")
					}
				}
				c < ' ' -> fail("control character in string")
				else -> b.append(c)
			}
		}
	}

	private fun num(): Json {
		val start = i
		if (i < s.length && s[i] == '-') i++
		if (i >= s.length || !s[i].isDigit()) fail("expected value")
		if (s[i] == '0') i++ else while (i < s.length && s[i].isDigit()) i++
		if (i < s.length && s[i] == '.') { i++; if (i >= s.length || !s[i].isDigit()) fail("bad number"); while (i < s.length && s[i].isDigit()) i++ }
		if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
			i++
			if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
			if (i >= s.length || !s[i].isDigit()) fail("bad number")
			while (i < s.length && s[i].isDigit()) i++
		}
		return Json.Num(s.substring(start, i).toDouble())
	}
}

fun Json.obj(what: String): Map<String, Json> = (this as? Json.Obj)?.fields ?: throw MarklessDecodeError("$what must be an object")
fun Json.arr(what: String): List<Json> = (this as? Json.Arr)?.items ?: throw MarklessDecodeError("$what must be an array")
fun Json.str(what: String): String = (this as? Json.Str)?.value ?: throw MarklessDecodeError("$what must be a string")
fun Json.num(what: String): Double = (this as? Json.Num)?.value ?: throw MarklessDecodeError("$what must be a number")

fun Map<String, Json>.field(name: String, what: String): Json = this[name] ?: throw MarklessDecodeError("$what is missing \"$name\"")

fun Map<String, Json>.only(allowed: Set<String>, what: String) {
	for (k in keys) if (k !in allowed) throw MarklessDecodeError("$what has unknown field \"$k\"")
}

fun jsonString(value: String): String {
	val b = StringBuilder("\"")
	for (c in value) {
		when {
			c == '"' -> b.append("\\\"")
			c == '\\' -> b.append("\\\\")
			c == '\n' -> b.append("\\n")
			c == '\r' -> b.append("\\r")
			c == '\t' -> b.append("\\t")
			c == '\b' -> b.append("\\b")
			c == '\u000C' -> b.append("\\f")
			c < ' ' -> b.append("\\u").append(String.format("%04x", c.code))
			else -> b.append(c)
		}
	}
	return b.append('"').toString()
}

/** A JSON number's text: whole numbers without a fraction. */
fun jsonNumber(value: Double): String {
	if (value.isNaN() || value.isInfinite()) throw MarklessDecodeError("$value is not a JSON number")
	return if (value == Math.rint(value) && Math.abs(value) < 1e15) value.toLong().toString() else value.toString()
}

/** This value as JSON text. */
fun Json.text(): String = StringBuilder().also { write(this, it) }.toString()

private fun write(v: Json, out: StringBuilder) {
	when (v) {
		is Json.Obj -> {
			out.append('{')
			for ((n, e) in v.fields.entries.withIndex()) {
				if (n > 0) out.append(',')
				out.append(jsonString(e.key)).append(':')
				write(e.value, out)
			}
			out.append('}')
		}
		is Json.Arr -> {
			out.append('[')
			for ((n, x) in v.items.withIndex()) {
				if (n > 0) out.append(',')
				write(x, out)
			}
			out.append(']')
		}
		is Json.Str -> out.append(jsonString(v.value))
		is Json.Num -> out.append(jsonNumber(v.value))
		is Json.Bool -> out.append(v.value)
		Json.Null -> out.append("null")
	}
}
