"""Validate target wiring and bundled assets without the iOS SDK (macOS)."""
from pathlib import Path
import json
import plistlib
import subprocess
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1] / 'iOS'
project = root / 'Parkly.xcodeproj'
parsed = json.loads(subprocess.check_output(['plutil', '-convert', 'json', '-o', '-', str(project / 'project.pbxproj')]))
objects = parsed['objects']
targets = [o for o in objects.values() if o['isa'] == 'PBXNativeTarget']
assert len(targets) == 3
bundles = set()
for target in targets:
    role = target['name'].removeprefix('Parkly')
    scheme = ET.parse(project / 'xcshareddata' / 'xcschemes' / (target['name'] + '.xcscheme'))
    for build in scheme.findall('.//BuildableReference'):
        assert objects[build.attrib['BlueprintIdentifier']] == target
    for config_id in objects[target['buildConfigurationList']]['buildConfigurations']:
        settings = objects[config_id]['buildSettings']
        assert settings['PARKLY_ROLE'] == role.lower()
        bundles.add(settings['PRODUCT_BUNDLE_IDENTIFIER'])
        icon = root / 'Shared' / 'Assets.xcassets' / (settings['ASSETCATALOG_COMPILER_APPICON_NAME'] + '.appiconset')
        metadata = json.loads((icon / 'Contents.json').read_text())
        assert (icon / metadata['images'][0]['filename']).stat().st_size > 1000
    included = []
    for phase_id in target['buildPhases']:
        for build_id in objects[phase_id]['files']:
            file = objects[objects[build_id]['fileRef']]
            assert (root / file['path']).exists(), file['path']
            included.append(file['path'])
    assert set(included) == {'Shared/ServerPolicy.swift', 'Shared/ParklyApp.swift', 'Shared/BrowserModel.swift', 'Shared/mobile.css', 'Shared/PrivacyInfo.xcprivacy', 'Shared/Assets.xcassets'}
assert len(bundles) == 3, 'Each app must have an isolated bundle/container'
release = plistlib.loads((root / 'Config' / 'Release-Info.plist').read_bytes())
assert 'NSAppTransportSecurity' not in release, 'Release must use default ATS protection'
debug = plistlib.loads((root / 'Config' / 'Debug-Info.plist').read_bytes())
assert debug['NSAppTransportSecurity']['NSAllowsArbitraryLoadsInWebContent'] is True
assert release['ParklyRole'] == '$(PARKLY_ROLE)'
privacy = plistlib.loads((root / 'Shared' / 'PrivacyInfo.xcprivacy').read_bytes())
assert privacy['NSPrivacyTracking'] is False
assert privacy['NSPrivacyAccessedAPITypes'][0]['NSPrivacyAccessedAPITypeReasons'] == ['CA92.1']
print('Xcode project: three schemes, separate bundles, sources, resources, icons, ATS and privacy manifest passed.')
