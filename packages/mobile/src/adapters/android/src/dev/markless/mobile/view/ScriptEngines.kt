package dev.markless.mobile.view

import dev.markless.mobile.core.ScriptEngine

/**
 * Proof only (handler-boundary.md): the JavaScript engine the build linked, found by class name so the host builds and
 * runs without one. Loading the class does not start the engine; [start] does, on the first `script` op.
 */
object ScriptEngines {
	const val QUICKJS = "app.cash.quickjs.QuickJs"
	const val HERMES = "dev.markless.hermes.HermesEngine"

	fun linked(): Pair<String, (String) -> ScriptEngine>? {
		val loader = ScriptEngines::class.java.classLoader
		val quickjs = runCatching { Class.forName(QUICKJS, false, loader) }.getOrNull()
		if (quickjs != null) {
			val create = quickjs.getMethod("create")
			val evaluate = quickjs.getMethod("evaluate", String::class.java)
			return "quickjs" to { source: String ->
				val engine = create.invoke(null)
				evaluate.invoke(engine, source)
				ScriptEngine { expression -> evaluate.invoke(engine, expression) as String }
			}
		}
		val hermes = runCatching { Class.forName(HERMES, false, loader) }.getOrNull()
		if (hermes != null) {
			val evaluate = hermes.getMethod("evaluate", String::class.java)
			return "hermes" to { source: String ->
				val engine = hermes.getConstructor().newInstance()
				evaluate.invoke(engine, source)
				ScriptEngine { expression -> evaluate.invoke(engine, expression) as String }
			}
		}
		return null
	}
}
