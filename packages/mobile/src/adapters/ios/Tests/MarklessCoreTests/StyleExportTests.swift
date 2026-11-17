import Foundation
@testable import MarklessCore
import Testing

// Dragon's export of the counter (examples/markless-counter/out, Dragon branch cw/native-targets).
private let counterExport = try! Data(contentsOf: Bundle.module.url(forResource: "Fixtures/counter.native-style", withExtension: "json")!)
private let counterPayload = try! Data(contentsOf: {
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url.appendingPathComponent("conformance/counter.json")
}())

private func payload() throws -> (NativeViewPayload, [(node: String, text: String)]) {
	guard case let .object(fields) = try JSONValue.parse(counterPayload), let json = fields.first(where: { $0.0 == "payload" })?.1 else {
		throw PayloadError(path: "vector", reason: "no payload")
	}
	let decoded = try NativeViewPayload.decode(json)
	return (decoded, try NativeRuntime(payload: decoded).texts())
}

private func exportText(_ edit: (String) -> String = { $0 }) -> Data { Data(edit(String(decoding: counterExport, as: UTF8.self)).utf8) }

@Test func resolvesTheCounterToPoints() throws {
	let (decoded, texts) = try payload()
	let layout = try StyleExport.decode(counterExport).resolve(for: decoded, initialTexts: texts)
	#expect(layout.wrappers.map(\.id) == ["html", "body"])
	let button = try #require(layout.styles["h2"])
	#expect(button.frame == Frame(x: 424.453125 / 3, y: 101, width: 357.09375 / 3, height: 52))
	#expect(button.borderWidth == 2)
	#expect(button.cornerRadius == 12)
	#expect(button.background == RGBA(r: 37, g: 99, b: 235, alpha: 255))
	let label = try #require(layout.styles["h2:text0"])
	#expect(label.font?.size == 20)
	#expect(label.textColor == RGBA(r: 255, g: 255, b: 255, alpha: 255))
	#expect(layout.styles.count == decoded.nodes.count)
}

@Test(arguments: [
	("\"kind\": \"font\"", "\"kind\": \"letter-spacing\"", "unknown style write kind \"letter-spacing\""),
	("dragon.native-style-export/0", "dragon.native-style-export/1", "unsupported schema"),
	("\"text\": \"Count 0\"", "\"text\": \"Count 9\"", "laid out \"Count 9\""),
	("\"id\": \"h1:text0\"", "\"id\": \"h1:text9\"", "no style export node for h1:text0"),
	("\"styles\": [\n        \"solid\"", "\"styles\": [\n        \"dashed\"", "border styles"),
	("\"backend\": \"uikit\"", "\"backend\": \"appkit\"", "expected backend uikit"),
])
func refusesWhatItCannotDraw(find: String, replace: String, reason: String) throws {
	let (decoded, texts) = try payload()
	let edited = exportText { $0.replacingOccurrences(of: find, with: replace) }
	#expect(edited != counterExport)
	do {
		_ = try StyleExport.decode(edited).resolve(for: decoded, initialTexts: texts)
		Issue.record("accepted an export with \(replace)")
	} catch {
		#expect("\(error)".contains(reason), "\(error)")
	}
}

@Test func refusesAnonymousBoxesAndSyntheticBold() throws {
	let (decoded, texts) = try payload()
	let bold = exportText {
		$0.replacingOccurrences(
			of: "\"key\": \"foregroundColor\"",
			with: "\"key\": \"foregroundColor\"\n      },\n      {\n       \"kind\": \"synthetic-bold\", \"keys\": [9, 36], \"values\": [0.04, 0.03], \"key\": \"syntheticBold\"")
	}
	#expect(throws: PayloadError(path: "style", reason: "h1:text0: synthetic-bold is not implemented on iOS")) {
		try StyleExport.decode(bold).resolve(for: decoded, initialTexts: texts)
	}
	let anonymous = exportText { $0.replacingOccurrences(of: "\"id\": \"h1\",\n     \"parent\": \"h0\",\n     \"kind\": \"element\"", with: "\"id\": \"h1\",\n     \"parent\": \"h0\",\n     \"kind\": \"anonymous\"") }
	#expect(anonymous != counterExport)
	#expect(throws: PayloadError.self) { try StyleExport.decode(anonymous).resolve(for: decoded, initialTexts: texts) }
}
