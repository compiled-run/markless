import Foundation
import MarklessCore
import Testing

private let conformanceDirectory: URL = {
	if let override = ProcessInfo.processInfo.environment["MARKLESS_CONFORMANCE_DIR"] { return URL(fileURLWithPath: override) }
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url.appendingPathComponent("conformance")
}()

private func vectorFiles() throws -> [URL] {
	try FileManager.default.contentsOfDirectory(at: conformanceDirectory, includingPropertiesForKeys: nil)
		.filter { $0.pathExtension == "json" }
		.sorted { $0.lastPathComponent < $1.lastPathComponent }
}

@Test func conformanceVectorsExist() throws {
	#expect(try !vectorFiles().isEmpty, "no conformance vectors in \(conformanceDirectory.path)")
}

@Test(arguments: try vectorFiles())
func reproducesConformanceVector(file: URL) throws {
	let vector = try JSONValue.parse(Data(contentsOf: file))
	guard case let .object(fields) = vector else { Issue.record("vector is not an object"); return }
	let field = { (key: String) -> JSONValue? in fields.first { $0.0 == key }?.1 }
	let known = ["version", "payload", "initial", "initialAttributes", "initialArms", "steps"]
	#expect(fields.map(\.0).allSatisfy(known.contains), "unknown vector fields \(fields.map(\.0))")
	#expect(field("version") == .string("markless.native-conformance/0"))
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(try #require(field("payload"))))

	let initial = JSONValue.array(try runtime.texts().map { .array([.string($0.node), .string($0.text)]) })
	#expect(initial.jsonText == field("initial")?.jsonText)
	let attributes = try runtime.attributes().map { JSONValue.array([.string($0.node), .string($0.name), $0.value.map(JSONValue.string) ?? .null]) }
	#expect(attributes.isEmpty ? field("initialAttributes") == nil : JSONValue.array(attributes).jsonText == field("initialAttributes")?.jsonText)
	let arms = try runtime.arms().map { JSONValue.array([.string($0.node), $0.index.map { .number(Double($0)) } ?? .null]) }
	#expect(arms.isEmpty ? field("initialArms") == nil : JSONValue.array(arms).jsonText == field("initialArms")?.jsonText)

	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
		guard case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			case let .string(host)? = actionFields.first(where: { $0.0 == "host" })?.1,
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		else { Issue.record("malformed step \(step.jsonText)"); return }
		let event = try #require(NativeEventName(rawValue: eventName))
		let journal = JSONValue.array(try runtime.dispatch(NativeAction(event: event, host: host)).map(\.json))
		#expect(Array(journal.jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) \(eventName) on \(host)")
	}
}
