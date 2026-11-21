package dev.markless.mobile.core

/** The prefix of a timer the script set, as its `timer` and `clearTimer` entries name it (`script:3`). */
const val SCRIPT_TIMER = "script:"

/**
 * The URL a GET form leaves for: its action with the query replaced by the entries, each encoded as
 * `application/x-www-form-urlencoded` (UTF-8, a space as `+`, all but `*-._` and ASCII letters and digits escaped).
 */
fun nativeFormUrl(action: String, entries: List<Pair<String, String>>): String {
	fun encode(text: String) = text.toByteArray(Charsets.UTF_8).joinToString("") { b ->
		val byte = b.toInt() and 0xff
		when {
			byte == 0x20 -> "+"
			byte in 0x30..0x39 || byte in 0x41..0x5a || byte in 0x61..0x7a || byte == 0x2a || byte == 0x2d || byte == 0x2e || byte == 0x5f -> byte.toChar().toString()
			else -> "%%%02X".format(byte)
		}
	}
	val fragment = action.indexOf('#').let { if (it < 0) "" else action.substring(it) }
	val base = action.substringBefore('#')
	return base.substringBefore('?') + "?" + entries.joinToString("&") { "${encode(it.first)}=${encode(it.second)}" } + fragment
}

/** The continuation a device call from a script names: its answer goes back to the script. */
const val SCRIPT_CALL = "script:"

internal fun scriptCallId(continuation: String): Int? =
	if (continuation.startsWith(SCRIPT_CALL)) continuation.removePrefix(SCRIPT_CALL).toIntOrNull() else null

/**
 * A JavaScript engine as a host runs a payload's script: one persistent global scope; [evaluate] runs source as a script,
 * lets the Promise jobs it queued run, and returns `String()` of the completion value. A JavaScript throw is thrown back.
 */
interface ScriptEngine {
	fun evaluate(source: String): String
}

/** How a runtime gets the app's script engine and the bytes `crypto` draws from; the host owns both. */
interface ScriptHost {
	/** The app's engine, started the first time any screen asks; later asks give the same one. */
	fun start(): ScriptEngine

	/** 32 random bytes as 64 hex characters for one engine entry; asked for only when the script uses `crypto`. */
	fun seed(): String
}
