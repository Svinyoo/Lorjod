"""Structural checks runnable with Python only; not a substitute for Gradle build."""
from pathlib import Path
import hashlib
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
android = '{http://schemas.android.com/apk/res/android}'
manifest = ET.parse(root / 'app/src/main/AndroidManifest.xml').getroot()
app = manifest.find('application')
assert app.get(android + 'usesCleartextTraffic') == 'false'
assert app.get(android + 'allowBackup') == 'false'
assert app.get(android + 'fullBackupContent') == 'false'
assert app.find('activity').get(android + 'exported') == 'true'
assert [p.get(android + 'name') for p in manifest.findall('uses-permission')] == ['android.permission.INTERNET']
debug = ET.parse(root / 'app/src/debug/AndroidManifest.xml').getroot()
assert debug.find('application').get(android + 'usesCleartextTraffic') == 'true'
gradle = (root / 'app/build.gradle').read_text()
for role in ['renter', 'landlord', 'admin']:
    assert f"applicationIdSuffix '.{role}'" in gradle
    ET.parse(root / f'app/src/main/res/drawable/ic_{role}.xml')
assert "applicationIdSuffix '.debug'" in gradle
assert 'compileSdk 36' in gradle and 'targetSdk 36' in gradle and 'minSdk 26' in gradle
assert 'validateReleaseConfiguration' in gradle
assert 'usesCleartextTraffic' not in (root / 'app/src/main/java/com/parkly/mobile/MainActivity.java').read_text()
wrapper = root / 'gradle/wrapper/gradle-wrapper.jar'
assert hashlib.sha256(wrapper.read_bytes()).hexdigest() == '81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f', 'Official Gradle 8.13 wrapper checksum'
assert 'distributionSha256Sum=20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78' in (root / 'gradle/wrapper/gradle-wrapper.properties').read_text()
assert (root / 'gradlew').exists() and (root / 'gradlew.bat').exists()
strings = {node.get('name') for node in ET.parse(root / 'app/src/main/res/values/strings.xml').getroot()}
java = (root / 'app/src/main/java/com/parkly/mobile/MainActivity.java').read_text()
assert set(re.findall(r'R.string.(\w+)', java)) <= strings | {'app_name'}
ids = set()
for path in (root / 'app/src').rglob('*.xml'):
    tree = ET.parse(path)
    for element in tree.iter():
        value = element.get(android + 'id', '')
        if value.startswith('@+id/'): ids.add(value[5:])
assert set(re.findall(r'R.id.(\w+)', java)) <= ids
assert 'addJavascriptInterface(' not in java
assert 'handler.proceed(' not in java
assert (root / 'app/src/main/assets/mobile.css').is_file()
print('Android project structure: 3 flavors, resources, HTTPS policy, backup rules and official wrapper checksum passed.')
