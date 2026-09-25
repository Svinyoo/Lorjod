# Build tools and third-party components

- Gradle Wrapper scripts and JAR: official [Gradle v8.13.0 sources](https://github.com/gradle/gradle/tree/v8.13.0), Apache License 2.0. Scripts retain upstream copyright/license headers. This binary is build bootstrap infrastructure, not a generated app artifact.
- Wrapper JAR SHA-256: `81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f`.
- Gradle 8.13 binary distribution SHA-256: `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`. Set in wrapper properties so downloads are verified. [Official checksums](https://gradle.org/release-checksums/)
- Android Gradle Plugin 8.13.2: downloaded from Google's Maven repository when building; not vendored.
- JUnit 4.13.2: test-only dependency downloaded from Maven Central; not part of the shipped application.
- Android framework and WebView: provided by Android. No third-party runtime SDK is added to the app.
- Temporary local verification used Eclipse Temurin JDK 17, Eclipse ECJ 3.41.0 and Robolectric's `android-all:16-robolectric-13921718` API archive. They are not included in this repository or app dependencies. This supplementary Java check does not replace Android SDK resource compilation, dexing, lint, packaging, or device testing.
