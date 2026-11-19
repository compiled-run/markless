import Foundation
import JavaScriptCore
import MarklessCore

/// A payload's script engine on Apple platforms: one `JSContext` (the system's JavaScriptCore framework, linked by
/// reference, not shipped in the app). JavaScriptCore runs the Promise jobs a call queued before the call returns.
public final class JavaScriptCoreEngine: ScriptEngine {
	private let context: JSContext

	public init() throws {
		guard let context = JSContext() else { throw ScriptError("JavaScriptCore made no context") }
		context.name = "Markless"
		self.context = context
	}

	public func evaluate(_ source: String) throws -> String {
		context.exception = nil
		let result = context.evaluateScript(source)
		if let exception = context.exception {
			context.exception = nil
			let line = exception.objectForKeyedSubscript("line").map { $0.isUndefined ? "" : " (line \($0.toString() ?? ""))" } ?? ""
			throw ScriptError("JavaScript threw \(exception.toString() ?? "an exception")\(line)")
		}
		return result?.toString() ?? "undefined"
	}
}
