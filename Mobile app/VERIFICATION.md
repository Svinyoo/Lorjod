# ผลตรวจแอพ iOS — 22 กันยายน 2026

## ตรวจแล้ว

| การตรวจ | ผลจริง |
| --- | --- |
| `bash "Mobile app/scripts/check.sh"` | ผ่าน: project/schemes ทั้งสาม, Bundle ID แยก, Swift source membership, resources, icons, Release ATS และ privacy manifest |
| Swift `ServerPolicyTests` ในคำสั่งข้างต้น | ผ่าน 69 checks โดย compile/run source policy จริงด้วย Swift 6.1.2 บน macOS |
| `swiftc -frontend -parse` ในคำสั่งข้างต้น | parse syntax ของ SwiftUI/WebKit source ผ่าน; ไม่ใช่ iOS type checking หรือ linking |
| `plutil -lint` | project.pbxproj, Debug/Release Info.plist และ PrivacyInfo.xcprivacy ผ่าน |
| `npm test` | ผ่าน 15 tests, fail 0 ด้วย Node.js 24.15.0 |
| Proxy regression tests | Production ไม่ออก secure cookie หากไม่ trust proxy; ออก cookie พร้อม Secure/HttpOnly/SameSite เมื่อ opt-in loopback HTTPS proxy; session อ่านกลับได้; ข้ามบทบาทถูกปฏิเสธ; HTTP ตรงไม่ออก secure cookie |
| ตรวจภาพไอคอน | สร้างภาพ 1024 × 1024 ของทั้งสาม targets; เปิดดูไอคอน Renter แล้ว |
| `git diff --check` | ผ่าน |

การทดสอบ API ใช้ฐานข้อมูลชั่วคราว ไม่ใช้หรือล้าง `data/app.db` ของผู้ใช้ ครั้งแรก sandbox ไม่อนุญาตเปิดพอร์ต localhost (`EPERM`); รันอีกครั้งด้วยสิทธิ์ที่อนุมัติแล้วจึงผ่าน

## ยังไม่ได้ตรวจ

- Full iOS build ทั้ง Debug/Release: `xcode-select -p` ชี้ `/Library/Developer/CommandLineTools`; `xcodebuild -version` แจ้งว่าต้องใช้ Xcode เต็มรูปแบบ และไม่มี Xcode ใน Applications
- Simulator, iPhone/iPad จริง, signing, provisioning, Local Network permission, ATS บนอุปกรณ์ และพฤติกรรม keyboard/safe area
- การคลิก flow ธุรกิจใน WKWebView จริง; HTTP tests ไม่ทดแทน UI tests
- การตรวจ layout ใน browser: การเปิดหน้า local ผ่าน `file://` ถูกปิดกั้นโดย URL policy ของเครื่องมือ จึงไม่ได้ดำเนินการต่อด้วยวิธีเลี่ยงข้อจำกัด
- Archive, `.ipa`, TestFlight upload และ App Store review

**อย่าใช้รายงานนี้อ้างว่า iOS build หรือการติดตั้งบนเครื่องจริงผ่านแล้ว** ขั้นตอนที่เหลือให้ทำตาม [Readme_app.md](Readme_app.md) หัวข้อ Simulator, iPhone, Release และรายการทดสอบ

## เกณฑ์ก่อนส่งผู้ทดสอบ

1. Build Debug และ Release ผ่านทั้งสาม schemes ด้วย Xcode/iOS SDK
2. ติดตั้งทั้งสามแอพพร้อมกันบน iPhone ตรวจชื่อ ไอคอน และ session แยกกัน
3. ทดสอบสมัคร/ล็อกอินแต่ละ role และบัญชีผิดบทบาท
4. ทดสอบ Landlord สร้างลาน/ช่อง → Renter จอง → Landlord บันทึกเข้า–ออก → Admin แก้และตรวจ audit
5. ตรวจข้อผิดพลาด, offline, session หมดอายุ, แผนที่, dialog และปุ่มนำทาง
6. ตรวจจอเล็ก/ใหญ่, แนวตั้ง/แนวนอน, iPad, keyboard และ VoiceOver
7. Release ต้องใช้ HTTPS ของจริงและ secure cookie ได้ ก่อน archive/แจกผ่าน TestFlight
