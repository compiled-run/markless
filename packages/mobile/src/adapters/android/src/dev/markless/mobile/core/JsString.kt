package dev.markless.mobile.core

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode

/** JavaScript's `String(value)` (ECMA-262 Number::toString, radix 10) for the scalars a cell holds. */
object JsString {
	fun of(value: Scalar): String = when (value) {
		is Scalar.Num -> number(value.value)
		is Scalar.Str -> value.value
		is Scalar.Bool -> if (value.value) "true" else "false"
	}

	fun number(m: Double): String {
		if (m.isNaN()) return "NaN"
		if (m == 0.0) return "0"
		if (m.isInfinite()) return if (m > 0) "Infinity" else "-Infinity"
		if (m < 0) return "-" + number(-m)
		val (digits, n) = shortest(m)
		val k = digits.length
		return when {
			n in k..21 -> digits + "0".repeat(n - k)
			n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
			n in -5..0 -> "0." + "0".repeat(-n) + digits
			else -> {
				val e = n - 1
				val exp = if (e >= 0) "+$e" else "$e"
				if (k == 1) digits + "e" + exp else digits[0] + "." + digits.substring(1) + "e" + exp
			}
		}
	}

	/** The fewest significant digits that read back as [m], closest to [m]; returns the digits and the decimal exponent n with m ≈ 0.digits × 10^n. */
	private fun shortest(m: Double): Pair<String, Int> {
		val exact = BigDecimal(m)
		for (p in 1..17) {
			val r = exact.round(MathContext(p, RoundingMode.HALF_EVEN))
			if (r.toDouble() == m) {
				val unscaled = r.unscaledValue().toString().trimEnd('0')
				val stripped = r.stripTrailingZeros()
				val digits = if (unscaled.isEmpty()) "0" else unscaled
				val n = stripped.precision() - stripped.scale()
				return digits to n
			}
		}
		throw IllegalStateException("no shortest form for $m")
	}
}
