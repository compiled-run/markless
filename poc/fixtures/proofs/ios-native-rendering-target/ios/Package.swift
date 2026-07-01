// swift-tools-version: 6.0

import PackageDescription

let package = Package(
	name: "MarklessNativeProof",
	platforms: [
		.iOS(.v17),
	],
	products: [
		.library(name: "MarklessNativeProof", targets: ["MarklessNativeProof"]),
	],
	targets: [
		.target(
			name: "MarklessNativeProof",
			resources: [
				.process("Resources"),
			],
		),
		.testTarget(
			name: "MarklessNativeProofTests",
			dependencies: ["MarklessNativeProof"],
		),
	],
)
