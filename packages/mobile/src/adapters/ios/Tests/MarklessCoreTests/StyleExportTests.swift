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
	let layout = try StyleExport.decode(counterExport).resolve(for: decoded, initialTexts: texts, value: noCells)
	#expect(layout.styles["h0"]?.frame == Frame(x: 0, y: 0, width: 402, height: 201))
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

@Test func acceptsDragonsTextLinesWhichCoreTextDoesNotNeed() throws {
	let (decoded, texts) = try payload()
	let lines = "\"lines\": [{ \"top\": 0, \"baseline\": 70, \"runs\": [{ \"face\": \"Ahem\", \"size\": 60, \"glyphs\": [1, 2], \"xs\": [0, 60] }] }],\n     \"text\": \"Counter\""
	let edited = exportText { $0.replacingOccurrences(of: "\"text\": \"Counter\"", with: lines) }
	#expect(edited != counterExport)
	let layout = try StyleExport.decode(edited).resolve(for: decoded, initialTexts: texts, value: noCells)
	#expect(layout.styles["h1:text0"]?.frame == Frame(x: 0, y: 0, width: 284.953125 / 3, height: 29))
}

@Test func visibilityHiddenHidesTheBoxAndTheTextInsideIt() throws {
	let (decoded, texts) = try payload()
	let red = "\"writes\": [\n      {\n       \"kind\": \"background-color\",\n       \"color\": {\n        \"r\": 37,"
	let hidden = "\"writes\": [\n      { \"kind\": \"visibility\", \"value\": \"hidden\", \"canvas\": false, \"key\": \"visibility\" },\n      {\n       \"kind\": \"background-color\",\n       \"color\": {\n        \"r\": 37,"
	let edited = exportText { $0.replacingOccurrences(of: red, with: hidden) }
	#expect(edited != counterExport)
	let layout = try StyleExport.decode(edited).resolve(for: decoded, initialTexts: texts, value: noCells)
	let button = try #require(layout.styles["h2"])
	#expect(button.hidden)
	#expect(button.background == nil)
	#expect(button.borderWidth == 0)
	#expect(layout.styles["h2:text0"]?.hidden == true)
	#expect(layout.styles["h1"]?.hidden == false)
	#expect(layout.styles["h1:text0"]?.hidden == false)
	let gone = exportText { $0.replacingOccurrences(of: red, with: hidden.replacingOccurrences(of: "\"hidden\"", with: "\"gone\"")) }
	#expect(throws: PayloadError.self) { try StyleExport.decode(gone).resolve(for: decoded, initialTexts: texts, value: noCells) }
}

@Test(arguments: [
	("\"kind\": \"font\"", "\"kind\": \"letter-spacing\"", "unknown style write kind \"letter-spacing\""),
	("dragon.native-style-export/0", "dragon.native-style-export/2", "unsupported schema"),
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
		_ = try StyleExport.decode(edited).resolve(for: decoded, initialTexts: texts, value: noCells)
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
		try StyleExport.decode(bold).resolve(for: decoded, initialTexts: texts, value: noCells)
	}
}

@Test func unnamedExportBoxesOffsetTheirChildrenAndPaintNothing() throws {
	let (decoded, texts) = try payload()
	let shifted = exportText {
		$0.replacingOccurrences(
			of: "\"id\": \"body\",\n     \"parent\": \"html\",\n     \"kind\": \"element\",\n     \"native\": \"DragonBoxView\",\n     \"text\": null,\n     \"frame\": {\n      \"x\": 0,\n      \"y\": 0,",
			with: "\"id\": \"body\",\n     \"parent\": \"html\",\n     \"kind\": \"anonymous\",\n     \"native\": \"DragonBoxView\",\n     \"text\": null,\n     \"frame\": {\n      \"x\": 30,\n      \"y\": 60,")
	}
	#expect(shifted != counterExport)
	let layout = try StyleExport.decode(shifted).resolve(for: decoded, initialTexts: texts, value: noCells)
	#expect(layout.styles["h0"]?.frame == Frame(x: 10, y: 20, width: 402, height: 201))
	#expect(layout.styles["h1"]?.frame == Frame(x: 460.515625 / 3, y: 48, width: 284.953125 / 3, height: 29))
	let wrongParent = exportText { $0.replacingOccurrences(of: "\"id\": \"h2\",\n     \"parent\": \"h0\"", with: "\"id\": \"h2\",\n     \"parent\": \"h1\"") }
	#expect(throws: PayloadError.self) { try StyleExport.decode(wrongParent).resolve(for: decoded, initialTexts: texts, value: noCells) }
}

private func noCells(_ cell: String) throws -> NativeValue { throw PayloadError(path: "test", reason: "no cell \(cell)") }

/// The attributes rung's payload with a `/1` export written from it: two assignments that differ in the heart's background.
private func toggleExport(initial: Int = 0) throws -> (NativeViewPayload, Data) {
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: url.appendingPathComponent("conformance/attributes.json"))),
		let json = fields.first(where: { $0.0 == "payload" })?.1
	else { throw PayloadError(path: "vector", reason: "no payload") }
	let payload = try NativeViewPayload.decode(json)
	let texts = Dictionary(uniqueKeysWithValues: try NativeRuntime(payload: payload).texts().map { ($0.node, $0.text) })
	func nodes(_ red: Int) -> String {
		payload.nodes.map { node in
			let text = node.isText ? "\"\(texts[node.id]!)\"" : "null"
			let writes = node.isText ? "" : #"{"kind":"background-color","color":{"r":\#(node.id == "h2" ? red : 0),"g":0,"b":0,"alpha":255},"key":"backgroundColor"}"#
			return #"{"id":"\#(node.id)","parent":\#(node.parent.map { "\"\($0)\"" } ?? "null"),"kind":"\#(node.isText ? "text" : "element")","native":"\#(node.isText ? "DragonTextView" : "DragonBoxView")","text":\#(text),"frame":{"x":0,"y":0,"width":30,"height":30},"borderWidths":\#(node.isText ? "null" : #"{"top":0,"right":0,"bottom":0,"left":0}"#),"writes":[\#(writes)]}"#
		}.joined(separator: ",")
	}
	let export = #"""
		{"schema":"dragon.native-style-export/1","units":"device px; frames relative to the parent box","fonts":[],"targets":{"ios":{"backend":"uikit","viewport":{"width":402,"height":778},"dpr":3,
		"states":[{"key":"doc/app#state:liked","domain":[false,true]}],"initial":\#(initial),
		"assignments":[{"values":{"doc/app#state:liked":false},"nodes":[\#(nodes(10))]},{"values":{"doc/app#state:liked":true},"nodes":[\#(nodes(200))]}],
		"next":[[[0,1]],[[0,1]]]}}}
		"""#
	return (payload, Data(export.utf8))
}

@Test func perStateExportsStartAtTheCellsValuesAndMoveByTheNextTable() throws {
	let (payload, export) = try toggleExport()
	let texts = try NativeRuntime(payload: payload).texts()
	let layout = try StyleExport.decode(export).resolve(for: payload, initialTexts: texts) { _ in .bool(false) }
	#expect(layout.start == 0)
	#expect(layout.styles["h2"]?.background?.r == 10)
	let liked = try layout.next(from: 0, cell: "state:liked", value: .bool(true))
	#expect(layout.assignments[liked]["h2"]?.background?.r == 200)
	#expect(try layout.next(from: liked, cell: "state:liked", value: .bool(false)) == 0)
	#expect(throws: PayloadError.self) { try layout.next(from: 0, cell: "state:liked", value: .string("yes")) }
	let stored = try StyleExport.decode(export).resolve(for: payload, initialTexts: texts) { _ in .bool(true) }
	#expect(stored.start == 1)
}

// Dragon's own export of its ms-text ladder fixture (examples/markless-styles/out on Dragon's native-dragon-styles branch).
@Test func readsDragonsCurrentPerStateExport() throws {
	let export = try StyleExport.decode(Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/ms-text.native-style", withExtension: "json"))))
	#expect(export.assignments.count == 1)
	#expect(export.notReady?.contains("analysis-only") == true)
	#expect(export.assignments[0].nodes.contains { $0.isText })
}

@Test func readsTheSchemeEachAssignmentIsDrawnInAndRefusesAnUnknownOne() throws {
	let url = try #require(Bundle.module.url(forResource: "Fixtures/ms-text.native-style", withExtension: "json"))
	let text = String(decoding: try Data(contentsOf: url), as: UTF8.self)
	let dark = text.replacingOccurrences(of: "\"values\": {},", with: "\"values\": {}, \"colorScheme\": \"dark\",")
	#expect(dark != text)
	#expect(try StyleExport.decode(Data(dark.utf8)).assignments.count == 1)
	let other = text.replacingOccurrences(of: "\"values\": {},", with: "\"values\": {}, \"colorScheme\": \"sepia\",")
	#expect(throws: PayloadError.self) { try StyleExport.decode(Data(other.utf8)) }
}
