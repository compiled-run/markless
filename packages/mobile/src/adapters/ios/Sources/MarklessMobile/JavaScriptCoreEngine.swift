#if canImport(JavaScriptCore)
import Foundation
import JavaScriptCore
import MarklessCore

/// Proof only (handler-boundary.md): the system JavaScriptCore as the engine `script` ops run in.
public final class JavaScriptCoreEngine: NativeScriptEngine {
	private let context: JSContext

	public init(source: String) throws {
		guard let context = JSContext() else { throw ScriptEngineError(description: "JavaScriptCore gave no context") }
		self.context = context
		_ = try call(source)
	}

	public func call(_ expression: String) throws -> String {
		context.exception = nil
		let result = context.evaluateScript(expression)
		if let exception = context.exception { throw ScriptEngineError(description: "script handler threw: \(exception)") }
		return result?.toString() ?? "undefined"
	}
}
public struct ScriptEngineError: Error, CustomStringConvertible {
	public let description: String
}
#endif
