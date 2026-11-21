package dev.markless.mobile.core

/** A vector as the conformance writer leaves it, markers where the phone engine goes, with the engine text put back (files services.js and entries.js). */
object ConformanceEngine {
	private val markers = listOf("/*markless-engine:services*/" to "services.js", "/*markless-engine:entries*/" to "entries.js")

	fun put(vector: String, read: (String) -> String): String {
		var text = vector
		for ((marker, name) in markers) if (marker in text) text = text.replace(marker, jsonString(read(name).removeSuffix("\n")).removeSurrounding("\""))
		return text
	}
}
