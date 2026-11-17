package dev.markless.mobile.core

import java.math.BigInteger

/** ECMAScript's operations on the scalar values a cell or expression holds (numbers are IEEE doubles). */
object Js {
	fun truthy(v: Scalar): Boolean = when (v) {
		Scalar.Null -> false
		is Scalar.Num -> !(v.value == 0.0 || v.value.isNaN())
		is Scalar.Str -> v.value.isNotEmpty()
		is Scalar.Bool -> v.value
	}

	fun toNumber(v: Scalar): Double = when (v) {
		Scalar.Null -> 0.0
		is Scalar.Num -> v.value
		is Scalar.Bool -> if (v.value) 1.0 else 0.0
		is Scalar.Str -> stringToNumber(v.value)
	}

	fun toStr(v: Scalar): String = JsString.of(v)

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

	fun strictEquals(a: Scalar, b: Scalar): Boolean = when {
		a is Scalar.Num && b is Scalar.Num -> a.value == b.value
		a is Scalar.Str && b is Scalar.Str -> a.value == b.value
		a is Scalar.Bool && b is Scalar.Bool -> a.value == b.value
		else -> a == Scalar.Null && b == Scalar.Null
	}

	/** IsLessThan; null stands for undefined (a NaN comparison). */
	private fun lessThan(a: Scalar, b: Scalar): Boolean? {
		if (a is Scalar.Str && b is Scalar.Str) return a.value < b.value
		val x = toNumber(a); val y = toNumber(b)
		if (x.isNaN() || y.isNaN()) return null
		return x < y
	}

	fun binary(op: String, a: Scalar, b: Scalar): Scalar = when (op) {
		"+" -> if (a is Scalar.Str || b is Scalar.Str) Scalar.Str(toStr(a) + toStr(b)) else Scalar.Num(toNumber(a) + toNumber(b))
		"-" -> Scalar.Num(toNumber(a) - toNumber(b))
		"*" -> Scalar.Num(toNumber(a) * toNumber(b))
		"/" -> Scalar.Num(toNumber(a) / toNumber(b))
		"%" -> Scalar.Num(toNumber(a) % toNumber(b))
		"===" -> Scalar.Bool(strictEquals(a, b))
		"!==" -> Scalar.Bool(!strictEquals(a, b))
		"<" -> Scalar.Bool(lessThan(a, b) == true)
		">" -> Scalar.Bool(lessThan(b, a) == true)
		"<=" -> Scalar.Bool(lessThan(b, a) == false)
		">=" -> Scalar.Bool(lessThan(a, b) == false)
		else -> throw MarklessRuntimeError("unknown binary operator \"$op\"")
	}

	fun unary(op: String, v: Scalar): Scalar = when (op) {
		"!" -> Scalar.Bool(!truthy(v))
		"-" -> Scalar.Num(-toNumber(v))
		"+" -> Scalar.Num(toNumber(v))
		else -> throw MarklessRuntimeError("unknown unary operator \"$op\"")
	}

	/** Math.round: the nearest integer, halves toward +Infinity, keeping -0 for [-0.5, -0]. */
	fun round(x: Double): Double {
		if (x.isNaN() || x.isInfinite() || x == 0.0) return x
		if (x > 0 && x < 0.5) return 0.0
		if (x < 0 && x >= -0.5) return -0.0
		val f = Math.floor(x)
		return if (x - f >= 0.5) f + 1 else f
	}

	/** The builtins a payload may call; a missing argument is undefined. */
	fun call(name: String, args: List<Scalar>): Scalar {
		fun num(i: Int): Double = if (i < args.size) toNumber(args[i]) else Double.NaN
		return when (name) {
			"String" -> Scalar.Str(if (args.isEmpty()) "" else toStr(args[0]))
			"Number" -> Scalar.Num(if (args.isEmpty()) 0.0 else toNumber(args[0]))
			"Boolean" -> Scalar.Bool(args.isNotEmpty() && truthy(args[0]))
			"Math.abs" -> Scalar.Num(Math.abs(num(0)))
			"Math.floor" -> Scalar.Num(Math.floor(num(0)))
			"Math.round" -> Scalar.Num(round(num(0)))
			"Math.max" -> Scalar.Num(args.map(::toNumber).fold(Double.NEGATIVE_INFINITY) { acc, x -> if (acc.isNaN() || x.isNaN()) Double.NaN else if (x > acc || (x == 0.0 && acc == 0.0 && 1 / acc < 0)) x else acc })
			"Math.min" -> Scalar.Num(args.map(::toNumber).fold(Double.POSITIVE_INFINITY) { acc, x -> if (acc.isNaN() || x.isNaN()) Double.NaN else if (x < acc || (x == 0.0 && acc == 0.0 && 1 / x < 0)) x else acc })
			else -> throw MarklessRuntimeError("unknown builtin \"$name\"")
		}
	}
}
