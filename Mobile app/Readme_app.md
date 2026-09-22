# Parkly บน iOS — คู่มือติดตั้งและใช้งานทั้ง 3 แอพ

โปรเจกต์นี้เพิ่ม **Parkly Renter**, **Parkly Landlord** และ **Parkly Admin** ติดตั้งพร้อมกันบน iPhone/iPad ได้ แต่ละแอพมีชื่อ ไอคอน Bundle Identifier และคุกกี้ล็อกอินแยกกัน ใช้เซิร์ฟเวอร์และฐานข้อมูล Parkly ร่วมกัน

การมีสามบทบาทไม่จำเป็นต้องแยกสามแอพเสมอไป แต่รุ่นนี้แยกตามขอบเขตงาน เพื่อให้ทั้งสามบทบาทใช้บัญชีพร้อมกันได้ชัดเจน

**สถานะ:** เป็น source code และ Xcode project ยังไม่มี `.ipa` ที่เซ็นแล้ว และยังไม่ได้เผยแพร่ App Store/TestFlight เครื่องที่พัฒนางานนี้มีเฉพาะ Command Line Tools ไม่มี Xcode/iOS SDK จึงยังไม่ได้ยืนยัน full iOS build หรือทดสอบบน Simulator/iPhone จริง ดู [ผลตรวจและสิ่งที่ยังต้องทดสอบ](VERIFICATION.md)

## 1. แอพแต่ละตัว

| แอพ / Xcode scheme | บทบาทและความสามารถ | หน้าเริ่มต้น | Bundle ID เริ่มต้น |
| --- | --- | --- | --- |
| `ParklyRenter` | ผู้เช่า: สมัคร ค้นหาลาน เพิ่มรถ ขอราคา จอง ดู Pass ต่อเวลา | `/` | `com.example.parkly.renter` |
| `ParklyLandlord` | ผู้ให้เช่า: สมัคร สร้างลาน เพิ่มช่อง เปิดรับจอง บันทึกเข้า–ออก | `/landlord/` | `com.example.parkly.landlord` |
| `ParklyAdmin` | ผู้ดูแล: ตรวจและแก้ข้อมูลพร้อมเหตุผลและ audit | `/admin/` | `com.example.parkly.admin` |

เปลี่ยน Bundle ID เป็นของคุณก่อนเซ็นแอพ บัญชี Admin ต้องสร้างจากเซิร์ฟเวอร์ ไม่มีหน้าสมัครสาธารณะ

## 2. สถาปัตยกรรมและสิ่งที่เพิ่ม

ใช้ **SwiftUI + WKWebView** ของ Apple ไม่ต้องติดตั้ง CocoaPods, Capacitor หรือ npm packages เพิ่มสำหรับ iOS ตัวแอพติดตั้งเป็นแอพ iOS แต่หน้าธุรกิจโหลดจากเว็บ Parkly เดิม จึงต้องเชื่อมต่อเซิร์ฟเวอร์ระหว่างใช้งาน ไม่มี Node.js/SQLite ฝังอยู่ใน iPhone

```text
Parkly Renter   ── WKWebView ── /          ┐
Parkly Landlord ── WKWebView ── /landlord/ ├─ HTTPS ─ Express ─ SQLite
Parkly Admin    ── WKWebView ── /admin/    ┘
```

สิ่งที่เพิ่มเฉพาะแอพ:

- แถบชื่อ ปุ่มย้อนกลับ หน้าแรก และตั้งค่าการเชื่อมต่อแบบ native
- หน้าข้อผิดพลาดเมื่อเปิดเซิร์ฟเวอร์ไม่ได้ พร้อมปุ่มเปิดหน้าแรกใหม่
- Debug กรอก URL เซิร์ฟเวอร์ได้; Release ใช้ HTTPS URL ที่กำหนดตอน build
- session แยกตาม Bundle ID; เปลี่ยนเซิร์ฟเวอร์แล้วล้างคุกกี้/แคชของแอพนั้น
- จำกัดการนำทางตาม origin และบทบาท; ลิงก์ภายนอกเปิดเมื่อผู้ใช้กด เช่น แผนที่
- รองรับ alert/confirm/prompt และลิงก์ `target="_blank"` ภายในบทบาทเดิม
- CSS เฉพาะแอพปรับช่องกรอกและการจัดวางบนมือถือ และซ่อนลิงก์สลับบทบาท
- แผ่นปิดข้อมูลขณะแอพไม่ active เพื่อลดข้อมูลในภาพสลับแอพ ไม่ใช่การป้องกัน screenshot ทุกชนิด

สิทธิ์จริงยังตรวจที่ API เช่นเดิม การติดตั้ง Parkly Admin ไม่ได้ให้สิทธิ์ Admin อัตโนมัติ ไม่มี token/password bridge จากเว็บเข้าสู่ native

## 3. โครงสร้าง

```text
Mobile app/
  Readme_app.md
  VERIFICATION.md
  iOS/
    Parkly.xcodeproj/                 # เปิดใน Xcode; มี 3 shared schemes
    Config/
      Common.xcconfig                # iOS ขั้นต่ำ 16, version, Bundle prefix
      Debug.xcconfig                 # รุ่นพัฒนา
      Release.xcconfig               # รุ่นแจกจ่าย
      Local.xcconfig.example         # ตัวอย่าง Team และ URL ของคุณ
      Debug-Info.plist                # HTTP สำหรับ WebView รุ่นพัฒนา
      Release-Info.plist              # ATS มาตรฐาน ไม่มี HTTP exception
    Shared/
      ParklyApp.swift                # หน้าหลักและหน้าตั้งค่า native
      BrowserModel.swift             # WebView, cookies, navigation
      ServerPolicy.swift             # ตรวจ URL และเส้นทางตามบทบาท
      mobile.css                     # CSS เฉพาะแอพ
      Assets.xcassets/               # ไอคอน R, L, A
      PrivacyInfo.xcprivacy          # privacy manifest เบื้องต้น
    Tests/ServerPolicyTests.swift
  scripts/
    check.sh                         # ตรวจ policy/project/syntax บน Mac
    check-project.py
    generate-project.py              # สร้าง Xcode project/plist/manifest
    generate-icons.swift             # สร้างไอคอนพัฒนาด้วย AppKit
```

โค้ดธุรกิจยังใช้ `client_Renter/`, `Client_Landlord/`, `Client_Admin/` และ `server/` เดิม Backend เพิ่มเพียง `HOST` เพื่อเลือก interface และ `TRUST_LOCAL_PROXY=1` เพื่อรองรับ secure session cookie หลัง HTTPS proxy บนเครื่องเดียวกัน ค่าเริ่มต้นเดิมไม่เปลี่ยน

## 4. สิ่งที่ต้องเตรียม

1. Mac พร้อม **Xcode เต็มรูปแบบ**, iOS SDK และ Simulator runtime แนะนำ Xcode 16 ขึ้นไป โดยต้องรองรับ iOS ของอุปกรณ์ที่ใช้ และตรวจข้อกำหนดล่าสุดก่อนส่ง App Store
2. Node.js 24 ตาม `.nvmrc` และ npm สำหรับเซิร์ฟเวอร์
3. iPhone/iPad ที่ใช้ iOS/iPadOS 16 ขึ้นไป หรือ Simulator
4. Apple Account สำหรับเซ็นลงเครื่องจริง; TestFlight/App Store ต้องมี Apple Developer Program และสิทธิ์ App Store Connect ที่เหมาะสม
5. สายต่อ iPhone กับ Mac สำหรับจับคู่ครั้งแรก และ Wi-Fi เดียวกันเมื่อใช้เซิร์ฟเวอร์บน Mac

เปิด Xcode ให้ติดตั้ง components ที่ต้องใช้ก่อน แล้วตรวจ:

```sh
xcode-select -p
xcodebuild -version
node --version
```

ถ้าแสดง `/Library/Developer/CommandLineTools` และใช้ `xcodebuild` ไม่ได้ ให้ติดตั้ง Xcode แล้วเลือกใน Xcode Settings → Locations → Command Line Tools หรือรันหลังติดตั้ง:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

Simulator ไม่ต้องใช้ signing team ส่วนอุปกรณ์จริงต้องเลือก Team และเปิด Developer Mode ตามขั้นตอน Apple [การรันแอพบน Simulator หรืออุปกรณ์จริง](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

## 5. เปิดเซิร์ฟเวอร์บน Mac

คำสั่งทั้งหมดในคู่มือเริ่มจาก **ราก repository `Lorjod`** ที่มี `package.json` ไม่ใช่โฟลเดอร์แม่ แนะนำแยกฐานข้อมูลทดลองมือถือ:

```sh
npm ci
export DATA_DIR="$TMPDIR/parkly-ios-demo"
export HOST=0.0.0.0
export PORT=3000
export NODE_ENV=development
export SESSION_SECRET="$(openssl rand -hex 32)"
npm start
```

อย่าปิด Terminal นี้ระหว่างใช้แอพ หากต้องการข้อมูลเดิม ให้ใช้ `DATA_DIR` เดิมหรือไม่กำหนดค่าเพื่อใช้ `data/app.db` อย่าลบฐานข้อมูลเพื่อแก้ปัญหาการเชื่อมต่อ

เปิด `http://localhost:3000` บน Mac ให้ได้ก่อน หา IP ของ Mac จาก System Settings → Wi-Fi → Details → TCP/IP หรือ `ipconfig getifaddr en0` หาก Wi-Fi ใช้ interface `en0`

| ที่เปิดแอพ | URL ในแอพ Debug |
| --- | --- |
| Simulator บน Mac เดียวกัน | `http://127.0.0.1:3000` |
| iPhone จริงใน Wi-Fi เดียวกัน (ตัวอย่าง Mac IP) | `http://192.168.1.10:3000` |
| เซิร์ฟเวอร์ออนไลน์ | `https://โดเมนของคุณ` |

**บน iPhone จริง `localhost` หมายถึง iPhone ไม่ใช่ Mac** กรอกเพียง scheme, hostname/IP และ port ห้ามเติม `/api`, `/admin` หรือ `/landlord` เพราะแอพเลือกเส้นทางให้เอง

Debug อนุญาต HTTP เฉพาะ localhost, loopback, IPv4 ส่วนตัว 10.x / 172.16–31.x / 192.168.x และชื่อ `.local` สำหรับ IPv6 รองรับ HTTP เฉพาะ localhost `::1`; กรณีอื่นใช้ HTTPS หรือ IPv4 ส่วนตัว

## 6. เปิดโปรเจกต์และติดตั้งบน Simulator

1. เปิด Finder ไปที่ `Mobile app/iOS/` แล้วดับเบิลคลิก `Parkly.xcodeproj`
2. เลือก scheme **ParklyRenter** ที่แถบด้านบน
3. เลือก iPhone Simulator ที่ติดตั้งแล้ว ถ้าไม่มีให้ติดตั้ง runtime ใน Xcode Settings
4. กด Run หรือ `⌘R`
5. ครั้งแรกกด **ตั้งค่าการเชื่อมต่อ** ใส่ `http://127.0.0.1:3000`
6. กด **บันทึกและเชื่อมต่อ** แล้วสมัคร/เข้าสู่ระบบ
7. เปลี่ยน scheme เป็น **ParklyLandlord** แล้วทำซ้ำ
8. เปลี่ยน scheme เป็น **ParklyAdmin** แล้วทำซ้ำ ใช้บัญชีตามหัวข้อ 9

ทั้งสามไอคอนอยู่พร้อมกันใน Simulator สลับจากหน้า Home ได้ แต่ละแอพต้องตั้ง URL ของตนเอง

ตรวจ build ทั้งสามโดยไม่เซ็นเมื่อมี Xcode:

```sh
for app in ParklyRenter ParklyLandlord ParklyAdmin; do
  xcodebuild \
    -project "Mobile app/iOS/Parkly.xcodeproj" \
    -scheme "$app" \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "Mobile app/iOS/DerivedData" \
    CODE_SIGNING_ALLOWED=NO build || break
done
```

คำสั่งนี้ตรวจ compile เท่านั้น ยังต้องกดใช้งานจริง เปลี่ยน `Debug` เป็น `Release` เพื่อตรวจรุ่นแจกจ่ายด้วย

## 7. เซ็นและติดตั้งทั้งสามแอพลง iPhone จริง

### 7.1 ตั้ง Team และ Bundle ID

1. Xcode → Settings → Accounts เพิ่ม Apple Account ของคุณ
2. คัดลอกไฟล์ตัวอย่าง:

   ```sh
   cp "Mobile app/iOS/Config/Local.xcconfig.example" "Mobile app/iOS/Config/Local.xcconfig"
   ```

3. แก้ `Local.xcconfig` เป็นค่าของคุณ:

   ```xcconfig
   PARKLY_BUNDLE_PREFIX = com.yourcompany.parkly
   DEVELOPMENT_TEAM = YOUR_TEAM_ID
   PARKLY_SERVER_URL =
   ```

   เปลี่ยน `YOUR_TEAM_ID` เป็น Team ID จริง หรือเว้นว่างแล้วเลือก Team ใน Signing & Capabilities ของทั้งสาม targets ส่วน URL เว้นว่างได้ใน Debug เพื่อกรอกในแอพ

4. คลิกโปรเจกต์ → TARGETS → แต่ละ target → Signing & Capabilities เปิด Automatically manage signing และตรวจ Team
5. ตรวจ Bundle Identifier ให้ใช้ prefix ของคุณและลงท้ายต่างกัน `.renter`, `.landlord`, `.admin`

`Local.xcconfig` ถูก ignore โดย Git ห้ามใส่รหัสผ่านผู้ใช้, session secret หรือ private key ในไฟล์แอพ

### 7.2 ติดตั้ง

1. ต่อ iPhone กับ Mac ปลดล็อกและกด Trust เมื่ออุปกรณ์ถาม
2. เปิด Settings → Privacy & Security → **Developer Mode** หากระบบร้องขอ แล้วรีสตาร์ต/ยืนยันตามหน้าจอ
3. เลือก iPhone เป็น Run Destination ใน Xcode
4. เลือก scheme `ParklyRenter` → Run รอสร้างและติดตั้ง
5. ถ้ามี Untrusted Developer ให้ตรวจ Settings → General → VPN & Device Management แล้วเชื่อถือโปรไฟล์นักพัฒนาของคุณตามข้อความระบบ
6. เปิดแอพ ตั้ง URL เป็น IP ของ Mac เช่น `http://192.168.1.10:3000`
7. อนุญาต **Local Network** เพื่อเชื่อมเซิร์ฟเวอร์ในเครือข่ายเดียวกัน
8. ทำซ้ำกับ `ParklyLandlord` และ `ParklyAdmin`

Personal Team สำหรับพัฒนามีข้อจำกัดและอายุโปรไฟล์ อาจต้องเซ็น/ติดตั้งใหม่ตามข้อความของ Xcode การส่ง `.ipa` ที่ยังไม่เซ็นให้เพื่อนจะไม่ทำให้ติดตั้งได้ทันที [เอกสารการติดตั้งจาก Xcode](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

## 8. สมัครและใช้งานผู้เช่า/ผู้ให้เช่า

### Parkly Renter

1. เปิดแอพและเชื่อมเซิร์ฟเวอร์ จะเข้าสู่หน้าเข้าสู่ระบบ
2. กด **สมัครสมาชิก** กรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร
3. เพิ่มรถ ระบุทะเบียนและประเภท `car`, `ev` หรือ `motorcycle`
4. ค้นหาลาน เลือกรถและช่วงเวลา แล้วขอราคา
5. ตรวจลาน รถ เวลา และยอดเงินก่อนยืนยัน ช่องทางชำระเงินยังเป็นเดโม
6. ดู Digital Pass และกดแผนที่เพื่อเปิดภายนอกแอพ
7. ต่อเวลาโดยตรวจจำนวนชั่วโมงและยอดก่อนยืนยัน
8. ใช้ปุ่ม **ออกจากระบบ** ในหน้าเว็บเมื่อเลิกใช้งาน

รถต้องตรงประเภทช่องจอด การจองใหม่ต้องเริ่มก่อนจบและไม่เกิน 24 ชั่วโมง Backend ตรวจข้อมูลและราคาใหม่ตอนจอง ใบเสนอราคาไม่ใช่การกันช่อง

### Parkly Landlord

1. เปิดแอพ กด **สมัครสมาชิก** เพื่อสร้างบัญชีผู้ให้เช่า
2. ใช้อีเมลที่ยังไม่ถูกใช้ บัญชีผู้เช่าเดิมไม่เปลี่ยนเป็นผู้ให้เช่าอัตโนมัติ
3. สร้างลาน ใส่ชื่อ ที่อยู่ พิกัด ราคาและจุดสังเกต ลานเริ่มเป็นฉบับร่าง
4. เพิ่มช่องพร้อมชื่อช่องและประเภทรถ
5. เปิดรับจอง แล้วตรวจว่าลานแสดงใน Renter หลังโหลดข้อมูลใหม่
6. ดูการจองของลานตนเอง ตรวจ Pass และทะเบียน
7. ในช่วงเวลาจอง บันทึกเข้า `confirmed → active` และออก `active → completed`
8. ยอดที่แสดงเป็นมูลค่าการจอง ไม่ใช่เงินที่รับจริง

ลานตัวอย่างไม่มีเจ้าของจะไม่ถูกยกให้บัญชีใหม่ ต้องสร้างลานของตัวเองสำหรับทดสอบ

## 9. สร้างและใช้งาน Admin

เปิดเซิร์ฟเวอร์อย่างน้อยหนึ่งครั้งเพื่อสร้าง schema แล้วเปิด Terminal อีกหน้าต่างที่ราก `Lorjod` ใช้ `DATA_DIR` เดียวกับเซิร์ฟเวอร์เสมอ

ตัวอย่าง zsh บน Mac สำหรับฐานข้อมูลทดลองหัวข้อ 5 ถามรหัสผ่านแบบไม่แสดงบนจอและไม่ใส่รหัสผ่านใน command history:

```sh
export DATA_DIR="$TMPDIR/parkly-ios-demo"
read "ADMIN_EMAIL?อีเมล Admin: "
read -s "ADMIN_PASSWORD?รหัสผ่าน Admin (อย่างน้อย 12 ตัวอักษร): "
echo
export ADMIN_EMAIL ADMIN_PASSWORD
node server/create-admin.js
unset ADMIN_PASSWORD ADMIN_EMAIL
```

ถ้าเซิร์ฟเวอร์ใช้ `data/app.db` ให้ไม่กำหนด `DATA_DIR` ใน Terminal สร้าง Admin เช่นกัน ไม่มีรหัสผ่านเริ่มต้น อีเมลซ้ำจะไม่เขียนทับหรือยกระดับบัญชีเดิม

จากนั้น:

1. เปิด **Parkly Admin** ตั้ง URL เดียวกับสองแอพอื่น
2. เข้าระบบด้วยบัญชีที่เพิ่งสร้าง
3. เลือกประเภทข้อมูล ค้นหารายการ และเปิดแก้ไข
4. ตรวจค่า ใส่เหตุผล แล้วบันทึก
5. ตรวจผลและประวัติ audit
6. ถ้าข้อมูลเปลี่ยนระหว่างแก้ไข ให้ปิดฟอร์ม โหลดใหม่ และตรวจอีกครั้ง

Admin แก้เฉพาะ field ที่ API อนุญาต ไม่เปลี่ยน role/password ผ่านหน้าจัดการ การแก้ยอดเป็นการแก้ข้อมูล ไม่ใช่เรียกเก็บหรือคืนเงิน

## 10. Session และการเชื่อมต่อ

- หน้าเว็บและ API ใช้ origin เดียว จึงใช้ session cookie เดิม ไม่ต้องเปิด CORS
- WKWebView เก็บคุกกี้แยกแต่ละแอพ แต่ session ขึ้นกับอายุคุกกี้/เซิร์ฟเวอร์ ซึ่งปัจจุบันเก็บ session ในหน่วยความจำ รีสตาร์ตเซิร์ฟเวอร์แล้วอาจต้องล็อกอินใหม่
- ปุ่ม native **หน้าแรก** ส่ง GET ไม่ส่งรายการจองซ้ำ การออกจากหน้าอาจทำให้ข้อมูลฟอร์มที่ยังไม่บันทึกหาย
- ถ้า timeout ระหว่างส่งการจอง ให้ตรวจรายการเดิมก่อนทำซ้ำ เพราะเครือข่ายล้มเหลวไม่ได้ยืนยันว่ารายการไม่สำเร็จ
- **ล้างการเข้าสู่ระบบในเครื่องนี้** ลบคุกกี้/แคชเฉพาะแอพ ไม่ลบบัญชีหรือฐานข้อมูล และไม่ทำลาย session ฝั่งเซิร์ฟเวอร์ ให้กดออกจากระบบก่อนเมื่อยังต่อได้
- Release ไม่ให้เปลี่ยน URL และไม่อ่าน URL ที่บันทึกจาก Debug ใช้ค่าที่กำหนดตอน build

## 11. ตั้ง HTTPS และ Release

Release ใช้ HTTPS ที่มี certificate เชื่อถือได้ ไม่มีการข้ามตรวจ certificate และไม่มี HTTP exception ใส่ค่าจริงใน `Local.xcconfig`:

```xcconfig
PARKLY_BUNDLE_PREFIX = com.yourcompany.parkly
DEVELOPMENT_TEAM = YOUR_TEAM_ID
PARKLY_SERVER_URL = https:/$()/parkly.example.com
```

เปลี่ยนโดเมนตัวอย่างเป็นของคุณ Syntax `https:/$()/` จำเป็นใน xcconfig เพราะ `//` ปกติเป็น comment ตอน build จะได้ `https://` เซิร์ฟเวอร์ต้องเสิร์ฟ `/`, `/landlord/`, `/admin/`, `/api/` จาก origin เดียว ไม่รองรับย้ายทั้งระบบไปใต้ subpath เช่น `/parkly/`

เมื่อ HTTPS จบที่ reverse proxy บนเครื่องเดียวกับ Node เช่น Nginx/Caddy และ upstream เชื่อมผ่าน loopback:

```sh
export NODE_ENV=production
export HOST=127.0.0.1
export PORT=3000
export TRUST_LOCAL_PROXY=1
export DATA_DIR=/path/to/your/persistent/parkly-data
export SESSION_SECRET="ค่าลับสุ่มที่ยาวและเฉพาะเซิร์ฟเวอร์ของคุณ"
npm start
```

เปลี่ยน path/secret เป็นค่าจริง เก็บ secret ใน environment หรือ secret manager ฝั่งเซิร์ฟเวอร์ Proxy ต้องเขียนทับ `X-Forwarded-Proto`, `X-Forwarded-For`, `X-Forwarded-Host` ให้ถูกต้อง และไม่เปิดพอร์ต Node ตรงสู่สาธารณะ

`TRUST_LOCAL_PROXY=1` เชื่อถือเฉพาะ loopback (`127.0.0.1/8`, `::1`) ไม่ครอบคลุม proxy คนละเครื่อง/container network ต้องปรับขอบเขต trust ให้ตรง topology ก่อน ไม่เปิด trust proxy ทุกแห่งเพื่อแก้ปัญหาล็อกอิน [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)

ก่อน production ยังต้องเตรียม shared/persistent session store, CSRF, rate limit, การป้องกัน concurrent booking และสำรองข้อมูลตามข้อจำกัดระบบเดิม การมีแอพ iOS ไม่ได้แก้สิ่งเหล่านี้อัตโนมัติ

## 12. แจกผ่าน TestFlight และ App Store

เป็นขั้นตอนสำหรับผู้ดูแลบัญชี Apple งานนี้ยังไม่ได้อัปโหลดหรือสร้าง app records:

1. เตรียมสมาชิก Apple Developer Program และ App Store Connect
2. ลงทะเบียน Bundle IDs สามตัว แล้วสร้าง app records ของทั้งสามแอพ
3. ตั้ง HTTPS URL และทดสอบ Release กับเซิร์ฟเวอร์ที่ผู้ทดสอบเข้าถึงได้
4. ตรวจ Team, Bundle ID, version/build number; เพิ่ม build number สำหรับอัปโหลดครั้งใหม่
5. เลือก scheme และปลายทาง iOS สำหรับ archive แล้วเลือก Product → Archive
6. ใน Organizer เลือก Distribute App แล้วอัปโหลด App Store Connect ตามหน้าจอ Xcode รุ่นที่ใช้
7. ทำซ้ำอีกสอง schemes แล้วรอประมวลผล
8. App Store Connect → TestFlight เพิ่มผู้ทดสอบตามสิทธิ์ที่อนุญาต จัดทำข้อมูลทดสอบและผ่านการตรวจ beta เมื่อระบบร้องขอ
9. ผู้ทดสอบติดตั้ง TestFlight รับคำเชิญ และติดตั้งทั้งสามแอพ

ตรวจอายุ build และกติกาการเชิญ/ตรวจ beta ล่าสุดที่ [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)

**ยังไม่รับประกัน App Store review:** รุ่นนี้ใช้ WebView เป็นหน้าธุรกิจ ต้องประเมินประสบการณ์มือถือและความครบถ้วนก่อนส่ง Apple มีเกณฑ์ Minimum Functionality และแอพที่ซ้ำกัน การแยกสามแอพควรอธิบายผู้ใช้และหน้าที่ที่ต่าง พร้อมบัญชีทดสอบแต่ละบทบาท [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

ก่อนส่งจริงต้องมี privacy policy, App Privacy, support URL, screenshots และวิธีขอลบบัญชีสำหรับแอพที่สมัครได้ ระบบเดิมยังไม่มี flow ลบบัญชีในแอพ ตรวจวิธีแจกจ่ายที่เหมาะสมสำหรับ Admin ซึ่งใช้เฉพาะผู้มีสิทธิ์ด้วย

`PrivacyInfo.xcprivacy` เป็นคำประกาศเริ่มต้นจาก UserDefaults และข้อมูลผู้ใช้/การจอง ต้องทบทวนให้ตรงบริการที่ deploy และ SDK ที่เพิ่ม ไม่ใช่การรับรองความครบถ้วนด้าน privacy

## 13. ทดสอบ

```sh
bash "Mobile app/scripts/check.sh"
npm test
```

คำสั่งแรก compile/run Swift policy ด้วย macOS toolchain ตรวจ Xcode project, assets, manifest และ parse syntax ของ UI แต่ไม่ compile UIKit/WebKit ด้วย iOS SDK `npm test` ใช้ฐานข้อมูลชั่วคราว ทดสอบ API และ secure cookie หลัง HTTPS proxy ไม่ใช่การคลิกในแอพ

เมื่อมี Xcode ให้ build Debug/Release ทั้งสามและทดสอบจริง:

- ติดตั้งครบสามไอคอน ตั้ง URL ล็อกอิน เปิดใหม่ และสลับแอพโดยไม่แย่ง session
- URL ผิด, HTTP สาธารณะ, URL มี path และ Release ที่ไม่ใช่ HTTPS ต้องถูกปฏิเสธ
- สมัครผู้เช่า/ผู้ให้เช่า; Admin ไม่มีสมัคร; บัญชีผิดบทบาทเข้าไม่ได้
- Landlord สร้างลานและช่อง → เปิดจอง → Renter จอง → Landlord เห็นและบันทึกเข้า–ออก
- Digital Pass และลิงก์แผนที่; Admin แก้พร้อมเหตุผล ตรวจ audit และ conflict
- หน้าว่าง/loading/error, ตัด Wi-Fi, ปิดเซิร์ฟเวอร์, session หมดอายุ และกู้คืนโดยไม่ส่งรายการซ้ำ
- ปุ่มย้อนกลับ/หน้าแรก, dialog, keyboard, submit, VoiceOver
- iPhone จอเล็ก/ใหญ่ แนวตั้ง/แนวนอน และ iPad; ฟอร์มเข้าถึงได้แม้มีแป้นพิมพ์
- เปลี่ยนเซิร์ฟเวอร์/ล้างคุกกี้เฉพาะแอพนั้น
- Debug ต่อ HTTP ใน LAN และ Release ต่อ HTTPS ที่ตั้ง secure cookie ได้

## 14. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีตรวจ |
| --- | --- |
| `xcodebuild requires Xcode` | ติดตั้ง Xcode เต็มรูปแบบและเลือก Command Line Tools ของ Xcode |
| ไม่เห็น iPhone/Simulator | ตรวจ runtime, สาย, Trust, Developer Mode และรุ่น Xcode ที่รองรับ iOS |
| Signing requires development team | เลือก Team ทุก target และเปลี่ยน Bundle prefix ให้เป็นของคุณ |
| เปิดแล้วให้ตั้งการเชื่อมต่อ | Debug ใส่ URL ในแอพ; Release กำหนด HTTPS ใน xcconfig แล้ว build ใหม่ |
| iPhone ต่อ localhost ไม่ได้ | ใช้ IP ของ Mac |
| Safari บน iPhone ก็เข้า IP ไม่ได้ | ตรวจ npm start, HOST, port, Wi-Fi, firewall และ guest network ที่แยกลูกข่าย |
| Safari เข้าได้แต่แอพไม่ได้ | ตรวจ Local Network permission และว่าเป็น Debug/Release |
| HTTP ใช้ใน Debug แต่ Release ไม่ได้ | ใช้ HTTPS และ certificate ที่เชื่อถือได้ |
| Production ล็อกอินแล้วไม่อยู่ | ตรวจ secure cookie, proxy, X-Forwarded-Proto และ TRUST_LOCAL_PROXY ตาม topology |
| บัญชีคนละบทบาท | เปิดแอพที่ตรงกับบัญชี ไม่แก้ role จาก client เพื่อข้ามสิทธิ์ |
| ไม่พบบัญชี Admin | DATA_DIR ตอนสร้างต้องตรงกับเซิร์ฟเวอร์ |
| ลานใหม่ไม่ขึ้นใน Renter | เพิ่มช่อง เปิดรับจอง แล้วอัปเดตข้อมูล |
| หลุดหลังรีสตาร์ตเซิร์ฟเวอร์ | session store อยู่ใน memory ต้องล็อกอินใหม่ |
| Admin บันทึกติด conflict | โหลดใหม่และตรวจอีกครั้ง ห้ามข้าม conflict/audit |
| แอพ Personal Team เปิดไม่ได้ในภายหลัง | ตรวจอายุ provisioning profile แล้วเซ็น/ติดตั้งใหม่จาก Xcode |

## 15. ดูแลโค้ดต่อ

Shared Swift/CSS ใช้ร่วมทั้งสาม targets การเพิ่ม Swift file ต้องเพิ่ม target membership ทั้งสาม หรือแก้ generator แล้วสร้างใหม่:

```sh
python3 "Mobile app/scripts/generate-project.py"
swift "Mobile app/scripts/generate-icons.swift" "Mobile app/iOS/Shared/Assets.xcassets"
```

Generator เขียนทับ project, schemes, Info.plist, privacy manifest และ asset metadata ถ้าแก้ไฟล์เหล่านี้ผ่าน Xcode ให้ปรับ generator ตามก่อนรันซ้ำ Source Swift/CSS และ xcconfig ไม่ถูกเขียนทับ เก็บ Team/Bundle prefix/URL ส่วนตัวใน Local.xcconfig เพื่อรักษาค่าเมื่อสร้าง project ใหม่

การชำระเงินจริง, push, QR เปิดประตู และการป้องกันจองพร้อมกันยังมีข้อจำกัดตาม [README หลัก](../README.md) งานนี้ไม่อ้างว่าฟังก์ชันเหล่านั้นพร้อม production
