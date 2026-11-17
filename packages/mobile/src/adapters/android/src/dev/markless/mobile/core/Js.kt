package dev.markless.mobile.core

import java.math.BigInteger

/** ECMAScript's operations on the scalar values a cell or expression holds (numbers are IEEE doubles). */
object Js {
	fun truthy(v: JsValue): Boolean = when (v) {
		JsValue.Null -> false
		is JsValue.Num -> !(v.value == 0.0 || v.value.isNaN())
		is JsValue.Str -> v.value.isNotEmpty()
		is JsValue.Bool -> v.value
		is JsValue.Arr, is JsValue.Obj -> true
	}

	/** ToPrimitive for the values here: arrays and objects read as their string. */
	private fun primitive(v: JsValue): JsValue = if (v is JsValue.Arr || v is JsValue.Obj) JsValue.Str(toStr(v)) else v

	fun toNumber(v: JsValue): Double = when (v) {
		JsValue.Null -> 0.0
		is JsValue.Num -> v.value
		is JsValue.Bool -> if (v.value) 1.0 else 0.0
		is JsValue.Str -> stringToNumber(v.value)
		is JsValue.Arr, is JsValue.Obj -> stringToNumber(toStr(v))
	}

	fun toStr(v: JsValue): String = JsString.of(v)

	private fun isJsSpace(c: Char): Boolean = c in '\u0009'..'\u000D' || c == '\u0020' || c == '\u00A0' || c == '\u1680' ||
		c in '\u2000'..'\u200A' || c == '\u2028' || c == '\u2029' || c == '\u202F' || c == '\u205F' || c == '\u3000' || c == '\uFEFF'

	/** StringToNumber: StrWhiteSpace, then empty (0), a signed decimal or Infinity, or an unsigned 0x/0o/0b integer; anything else is NaN. */
	fun stringToNumber(s: String): Double {
		val t = s.trim(::isJsSpace)
		if (t.isEmpty()) return 0.0
		if (t.length > 2 && t[0] == '0') {
			val radix = when (t[1]) { 'x', 'X' -> 16; 'o', 'O' -> 8; 'b', 'B' -> 2; else -> 0 }
			if (radix != 0) {
				val digits = t.substring(2)
				if (digits.all { Character.digit(it, radix) >= 0 }) return BigInteger(digits, radix).toDouble()
				return Double.NaN
			}
		}
		var i = 0
		val sign = when (t[0]) { '-' -> { i = 1; -1.0 }; '+' -> { i = 1; 1.0 }; else -> 1.0 }
		val rest = t.substring(i)
		if (rest == "Infinity") return sign * Double.POSITIVE_INFINITY
		var j = 0
		var mantissaDigits = 0
		while (j < rest.length && rest[j].isAsciiDigit()) { j++; mantissaDigits++ }
		if (j < rest.length && rest[j] == '.') { j++; while (j < rest.length && rest[j].isAsciiDigit()) { j++; mantissaDigits++ } }
		if (mantissaDigits == 0) return Double.NaN
		if (j < rest.length && (rest[j] == 'e' || rest[j] == 'E')) {
			j++
			if (j < rest.length && (rest[j] == '+' || rest[j] == '-')) j++
			val start = j
			while (j < rest.length && rest[j].isAsciiDigit()) j++
			if (j == start) return Double.NaN
		}
		if (j != rest.length) return Double.NaN
		return sign * rest.toDouble()
	}

	private fun Char.isAsciiDigit() = this in '0'..'9'

	fun strictEquals(a: JsValue, b: JsValue): Boolean = when {
		a is JsValue.Num && b is JsValue.Num -> a.value == b.value
		a is JsValue.Str && b is JsValue.Str -> a.value == b.value
		a is JsValue.Bool && b is JsValue.Bool -> a.value == b.value
		a is JsValue.Arr || a is JsValue.Obj -> a === b
		else -> a == JsValue.Null && b == JsValue.Null
	}

	/** SameValueZero, as `includes` compares: like `===` but NaN equals NaN. */
	fun sameValueZero(a: JsValue, b: JsValue): Boolean = strictEquals(a, b) || (a is JsValue.Num && b is JsValue.Num && a.value.isNaN() && b.value.isNaN())

	/** IsLessThan; null stands for undefined (a NaN comparison). */
	private fun lessThan(left: JsValue, right: JsValue): Boolean? {
		val a = primitive(left); val b = primitive(right)
		if (a is JsValue.Str && b is JsValue.Str) return a.value < b.value
		val x = toNumber(a); val y = toNumber(b)
		if (x.isNaN() || y.isNaN()) return null
		return x < y
	}

	fun binary(op: String, a: JsValue, b: JsValue): JsValue = when (op) {
		"+" -> { val x = primitive(a); val y = primitive(b); if (x is JsValue.Str || y is JsValue.Str) JsValue.Str(toStr(x) + toStr(y)) else JsValue.Num(toNumber(x) + toNumber(y)) }
		"-" -> JsValue.Num(toNumber(a) - toNumber(b))
		"*" -> JsValue.Num(toNumber(a) * toNumber(b))
		"/" -> JsValue.Num(toNumber(a) / toNumber(b))
		"%" -> JsValue.Num(toNumber(a) % toNumber(b))
		"===" -> JsValue.Bool(strictEquals(a, b))
		"!==" -> JsValue.Bool(!strictEquals(a, b))
		"<" -> JsValue.Bool(lessThan(a, b) == true)
		">" -> JsValue.Bool(lessThan(b, a) == true)
		"<=" -> JsValue.Bool(lessThan(b, a) == false)
		">=" -> JsValue.Bool(lessThan(a, b) == false)
		else -> throw MarklessRuntimeError("unknown binary operator \"$op\"")
	}

	fun unary(op: String, v: JsValue): JsValue = when (op) {
		"!" -> JsValue.Bool(!truthy(v))
		"-" -> JsValue.Num(-toNumber(v))
		"+" -> JsValue.Num(toNumber(v))
		else -> throw MarklessRuntimeError("unknown unary operator \"$op\"")
	}

	/** Math.round: the nearest integer, halves toward +Infinity, keeping -0 for [-0.5, -0]. */
	/** ToIntegerOrInfinity. */
	private fun integer(v: JsValue?): Double {
		val n = if (v == null) Double.NaN else toNumber(v)
		return if (n.isNaN()) 0.0 else if (n.isInfinite()) n else (if (n < 0) Math.ceil(n) else Math.floor(n)) + 0.0
	}

	/** A relative index (`slice`, `indexOf` from): negative counts from the end, clamped to 0..length. */
	private fun relative(v: JsValue?, length: Int, default: Int): Int {
		if (v == null) return default
		val n = integer(v)
		return (if (n < 0) maxOf(length + n, 0.0) else minOf(n, length.toDouble())).toInt()
	}

	/** A method argument: a value, or a function from its arguments (an arrow function in the payload). */
	sealed interface Arg {
		data class Value(val value: JsValue) : Arg
		class Callback(val call: (List<JsValue>) -> JsValue) : Arg
	}

	/** The array and string methods a payload may call, with JavaScript's meaning; a method the target lacks is an error. */
	fun method(name: String, target: JsValue, args: List<Arg>): JsValue {
		fun value(i: Int): JsValue? = (args.getOrNull(i) as? Arg.Value)?.value
		fun callback(): (List<JsValue>) -> JsValue = (args.getOrNull(0) as? Arg.Callback)?.call ?: throw MarklessRuntimeError("$name() needs a function")
		fun missing(): Nothing = throw MarklessRuntimeError(".$name() of a ${kind(target)}")
		return when (target) {
			is JsValue.Arr -> {
				val items = target.items
				fun each(): List<Pair<Int, JsValue>> = items.toList().withIndex().map { it.index to callback()(listOf(it.value, JsValue.Num(it.index.toDouble()), target)) }
				when (name) {
					"filter" -> { val f = callback(); JsValue.Arr(items.toList().withIndex().filter { truthy(f(listOf(it.value, JsValue.Num(it.index.toDouble()), target))) }.mapTo(ArrayList()) { it.value }) }
					"map" -> JsValue.Arr(each().mapTo(ArrayList()) { it.second })
					"findIndex" -> { val f = callback(); JsValue.Num(items.toList().withIndex().firstOrNull { truthy(f(listOf(it.value, JsValue.Num(it.index.toDouble()), target))) }?.index?.toDouble() ?: -1.0) }
					"some" -> { val f = callback(); JsValue.Bool(items.toList().withIndex().any { truthy(f(listOf(it.value, JsValue.Num(it.index.toDouble()), target))) }) }
					"every" -> { val f = callback(); JsValue.Bool(items.toList().withIndex().all { truthy(f(listOf(it.value, JsValue.Num(it.index.toDouble()), target))) }) }
					"includes" -> { val x = value(0) ?: JsValue.Null; val from = relative(value(1), items.size, 0); JsValue.Bool((from until items.size).any { sameValueZero(items[it], x) }) }
					"indexOf" -> { val x = value(0) ?: JsValue.Null; val from = relative(value(1), items.size, 0); JsValue.Num(((from until items.size).firstOrNull { strictEquals(items[it], x) } ?: -1).toDouble()) }
					"join" -> { val sep = value(0)?.let(::toStr) ?: ","; JsValue.Str(items.joinToString(sep) { if (it == JsValue.Null) "" else toStr(it) }) }
					"concat" -> JsValue.Arr(ArrayList(items).apply { for (i in args.indices) { val v = value(i) ?: missing(); if (v is JsValue.Arr) addAll(v.items) else add(v) } })
					"slice" -> { val from = relative(value(0), items.size, 0); val to = relative(value(1), items.size, items.size); JsValue.Arr(if (from < to) ArrayList(items.subList(from, to)) else ArrayList()) }
					"reverse" -> { items.reverse(); target }
					"toReversed" -> JsValue.Arr(items.asReversed().toMutableList())
					else -> missing()
				}
			}
			is JsValue.Str -> {
				val s = target.value
				when (name) {
					"includes" -> { val x = toStr(value(0) ?: JsValue.Null); val from = minOf(maxOf(integer(value(1)), 0.0), s.length.toDouble()).toInt(); JsValue.Bool(s.indexOf(x, from) >= 0) }
					"indexOf" -> { val x = toStr(value(0) ?: JsValue.Null); val from = minOf(maxOf(integer(value(1)), 0.0), s.length.toDouble()).toInt(); JsValue.Num(s.indexOf(x, from).toDouble()) }
					"concat" -> JsValue.Str(s + args.indices.joinToString("") { toStr(value(it) ?: missing()) })
					"slice" -> { val from = relative(value(0), s.length, 0); val to = relative(value(1), s.length, s.length); JsValue.Str(if (from < to) s.substring(from, to) else "") }
					"toUpperCase" -> JsValue.Str(s.uppercase(java.util.Locale.ROOT))
					"toLowerCase" -> JsValue.Str(s.lowercase(java.util.Locale.ROOT))
					"trim" -> JsValue.Str(s.trim(::isJsSpace))
					else -> missing()
				}
			}
			else -> missing()
		}
	}

	fun kind(v: JsValue): String = when (v) {
		JsValue.Null -> "null"
		is JsValue.Num -> "number"
		is JsValue.Str -> "string"
		is JsValue.Bool -> "boolean"
		is JsValue.Arr -> "array"
		is JsValue.Obj -> "object"
	}

	fun round(x: Double): Double {
		if (x.isNaN() || x.isInfinite() || x == 0.0) return x
		if (x > 0 && x < 0.5) return 0.0
		if (x < 0 && x >= -0.5) return -0.0
		val f = Math.floor(x)
		return if (x - f >= 0.5) f + 1 else f
	}

	/** The builtins a payload may call; a missing argument is undefined. */
	fun call(name: String, args: List<JsValue>): JsValue {
		fun num(i: Int): Double = if (i < args.size) toNumber(args[i]) else Double.NaN
		return when (name) {
			"String" -> JsValue.Str(if (args.isEmpty()) "" else toStr(args[0]))
			"Number" -> JsValue.Num(if (args.isEmpty()) 0.0 else toNumber(args[0]))
			"Boolean" -> JsValue.Bool(args.isNotEmpty() && truthy(args[0]))
			"Math.abs" -> JsValue.Num(Math.abs(num(0)))
			"Math.floor" -> JsValue.Num(Math.floor(num(0)))
			"Math.round" -> JsValue.Num(round(num(0)))
			"Math.max" -> JsValue.Num(args.map(::toNumber).fold(Double.NEGATIVE_INFINITY) { acc, x -> if (acc.isNaN() || x.isNaN()) Double.NaN else if (x > acc || (x == 0.0 && acc == 0.0 && 1 / acc < 0)) x else acc })
			"Math.min" -> JsValue.Num(args.map(::toNumber).fold(Double.POSITIVE_INFINITY) { acc, x -> if (acc.isNaN() || x.isNaN()) Double.NaN else if (x < acc || (x == 0.0 && acc == 0.0 && 1 / x < 0)) x else acc })
			else -> throw MarklessRuntimeError("unknown builtin \"$name\"")
		}
	}
}
