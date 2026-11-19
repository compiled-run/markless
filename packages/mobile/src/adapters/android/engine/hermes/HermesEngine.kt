package dev.markless.mobile.engine

import com.facebook.soloader.nativeloader.NativeLoader
import com.facebook.soloader.nativeloader.SystemDelegate

/**
 * One persistent Hermes runtime. Constructing it loads the native libraries and starts the runtime; loading the class
 * does neither. Call it from one thread.
 */
class HermesEngine : AutoCloseable {
	private var runtime: Long

	init {
		Libraries.load()
		runtime = nativeCreate()
	}

	/**
	 * Runs [source] as a script, then runs every queued Promise job, and returns `String(completion value)`.
	 * Throws [HermesException] carrying `String(error)` when the script or a job throws.
	 */
	fun evaluate(source: String): String {
		check(runtime != 0L) { "HermesEngine is closed" }
		return nativeEvaluate(runtime, source.toByteArray(Charsets.UTF_8))
	}

	override fun close() {
		if (runtime == 0L) return
		nativeDestroy(runtime)
		runtime = 0L
	}

	private external fun nativeCreate(): Long
	private external fun nativeEvaluate(runtime: Long, source: ByteArray): String
	private external fun nativeDestroy(runtime: Long)

	private object Libraries {
		init {
			// fbjni's HybridData loads itself through NativeLoader, which throws until a delegate is set.
			NativeLoader.initIfUninitialized(SystemDelegate())
			// fbjni's JNI_OnLoad records the JavaVM that Hermes's Intl calls into Java with; a NEEDED load skips it.
			System.loadLibrary("fbjni")
			System.loadLibrary("markless_hermes")
		}

		fun load() = Unit
	}
}

/** A script or Promise job threw; [message] is JavaScript's `String(error)`. */
class HermesException(message: String) : RuntimeException(message)
