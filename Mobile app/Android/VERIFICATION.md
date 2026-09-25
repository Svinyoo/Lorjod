# ผลตรวจ Android — 25 กันยายน 2026

## ผ่านแล้ว

| การตรวจ | ผลจริงและขอบเขต |
| --- | --- |
| `python3 scripts/check-project.py` | ผ่าน: 3 flavors/IDs, XML, resource references, permissions, Release HTTP policy, backup rules และ official Gradle Wrapper checksum |
| `sh scripts/check-policy.sh` ด้วย JDK 17 | ผ่าน 94 checks จาก source Java จริง: URL, local HTTP, Release HTTPS, role pages และ external links |
| Gradle 8.13 `:app:tasks --all` | `BUILD SUCCESSFUL`; AGP 8.13.2 โหลดและลงทะเบียน Debug/Release variants ครบทั้งสาม |
| Java type checking เพิ่มเติม | `MainActivity.java` และ `ServerPolicy.java` compile ผ่านด้วย Eclipse ECJ 3.41.0 และ Robolectric Android 16 API archive; ใช้ temporary R/BuildConfig symbols และ Java 8 source mode เพื่อเลี่ยง module overlap ของ API archive ไม่ใช่ Gradle Android build |
| `npm test` บน branch Android | ผ่าน 15 tests, fail 0 รวม Renter/Landlord/Admin, migration และ HTTPS proxy/session regression |
| Gradle Wrapper | JAR SHA-256 ตรงค่าทางการ และ pin distribution SHA-256 ใน properties |
| `git diff --check` | ผ่าน |

Java type checking มี deprecation warnings สำหรับ WindowInsets API ที่ใช้เฉพาะ fallback บน Android ก่อน API 30 และ annotation warning ไม่มี error การตรวจนี้ไม่ยืนยัน API availability ทุกเวอร์ชัน ต้องรัน Android lint/อุปกรณ์จริงเพิ่มเติม

JDK/API archive/compiler ที่ใช้ตรวจอยู่ในโฟลเดอร์ชั่วคราว ไม่ติดตั้งเป็น Java ของระบบและไม่อยู่ใน source/app dependencies การทดสอบ API ใช้ฐานข้อมูลชั่วคราว ไม่แตะ `data/app.db` ของผู้ใช้

## Build ที่ยังไม่สำเร็จ

ได้ลองรัน:

```sh
./gradlew --offline --no-daemon :app:assembleRenterDebug :app:assembleLandlordDebug :app:assembleAdminDebug
```

หยุดด้วย `SDK location not found` เพราะเครื่องไม่มี Android SDK และไม่ได้ตั้ง ANDROID_HOME/sdk.dir **จึงยังไม่มี APK/AAB ที่ตรวจ build ผ่าน** ไม่ได้ยอมรับ license หรือดาวน์โหลด SDK แทนผู้ใช้

การ compile แบบเสริมใช้ ECJ เนื่องจาก Robolectric Android 16 archive เป็น bytecode Java 21 ซึ่ง javac 17 อ่านตรง ๆ ไม่ได้ เรื่องนี้เป็นข้อจำกัดของเครื่องมือทดสอบเสริม ไม่ได้เปลี่ยน Gradle/JDK 17 requirement ของโปรเจกต์

## ยังต้องตรวจเมื่อมี Android SDK

1. Full Gradle build/resource merging/dexing/packaging ของทั้งสาม Debug และ Release
2. Gradle JUnit tasks และ Android lint ทั้งสาม flavors
3. UI บน Emulator และโทรศัพท์จริง: loading/empty/error, keyboard/insets, rotation, back, dialogs, maps, TalkBack และ session isolation
4. Flow Landlord สร้างลาน → Renter จอง/ต่อเวลา → Landlord เข้า–ออก → Admin แก้พร้อม audit/conflict
5. HTTP ใน Debug, HTTPS ใน Release, certificate rejection, session หมดอายุ และตัดเครือข่ายระหว่างทำรายการ
6. Signing ด้วย key ของเจ้าของแอพ และการติดตั้ง/อัปเดต Release

ขั้นตอนทั้งหมดอยู่ใน [Readme_appAndoird.md](../Readme_appAndoird.md) ไม่มีการอ้างว่าผ่าน device testing หรือเผยแพร่ Google Play แล้ว
