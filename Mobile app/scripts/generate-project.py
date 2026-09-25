"""Generate the three-target Xcode project using only Python's standard library.

Run from anywhere: python3 'Mobile app/scripts/generate-project.py'
Does not modify Swift or xcconfig files. Project-level edits are regenerated;
keep personal signing and server settings in Config/Local.xcconfig.
"""
from pathlib import Path
import hashlib
import json
import plistlib

ROOT = Path(__file__).resolve().parents[1] / 'iOS'
PROJECT = ROOT / 'Parkly.xcodeproj'
OBJECTS = {}


def ref(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()


def add(identifier, isa, **values):
    key = ref(identifier)
    OBJECTS[key] = dict(isa=isa, **values)
    return key


def plist(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(plistlib.dumps(value, sort_keys=False))


def openstep(value, indent=0):
    space = '\t' * indent
    if isinstance(value, dict):
        return '{\n' + ''.join(f'{space}\t{json.dumps(str(k))} = {openstep(v, indent + 1)};\n' for k, v in value.items()) + space + '}'
    if isinstance(value, list):
        return '(\n' + ''.join(f'{space}\t{openstep(v, indent + 1)},\n' for v in value) + space + ')'
    return json.dumps(str(value))


source_files = []
for name in ['ServerPolicy.swift', 'ParklyApp.swift', 'BrowserModel.swift']:
    source_files.append(add(name, 'PBXFileReference', lastKnownFileType='sourcecode.swift', path='Shared/' + name, sourceTree='SOURCE_ROOT'))
resources = []
for name, file_type in [('mobile.css', 'text.css'), ('PrivacyInfo.xcprivacy', 'text.xml'), ('Assets.xcassets', 'folder.assetcatalog')]:
    resources.append(add(name, 'PBXFileReference', lastKnownFileType=file_type, path='Shared/' + name, sourceTree='SOURCE_ROOT'))

config_refs = {}
for config in ['Debug', 'Release']:
    config_refs[config] = add(config, 'PBXFileReference', lastKnownFileType='text.xcconfig', path=f'Config/{config}.xcconfig', sourceTree='SOURCE_ROOT')

project_configs = []
for config in ['Debug', 'Release']:
    project_configs.append(add('Project' + config, 'XCBuildConfiguration', name=config, baseConfigurationReference=config_refs[config], buildSettings={}))
config_list = add('ProjectConfigs', 'XCConfigurationList', buildConfigurations=project_configs, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')

targets, products = [], []
for role in ['Renter', 'Landlord', 'Admin']:
    name = 'Parkly' + role
    product = add(name + 'Product', 'PBXFileReference', explicitFileType='wrapper.application', includeInIndex=0, path=name + '.app', sourceTree='BUILT_PRODUCTS_DIR')
    products.append(product)
    phases = []
    for kind, files in [('Sources', source_files), ('Resources', resources), ('Frameworks', [])]:
        builds = [add(name + file + 'Build', 'PBXBuildFile', fileRef=file) for file in files]
        phases.append(add(name + kind, 'PBX' + kind + 'BuildPhase', buildActionMask=2147483647, files=builds, runOnlyForDeploymentPostprocessing=0))
    configs = []
    for config in ['Debug', 'Release']:
        configs.append(add(name + config, 'XCBuildConfiguration', name=config, buildSettings={
            'PRODUCT_NAME': name,
            'PRODUCT_BUNDLE_IDENTIFIER': '$(PARKLY_BUNDLE_PREFIX).' + role.lower(),
            'PARKLY_ROLE': role.lower(),
            'PARKLY_DISPLAY_NAME': 'Parkly ' + role,
            'ASSETCATALOG_COMPILER_APPICON_NAME': 'AppIcon' + role,
        }))
    target_configs = add(name + 'Configs', 'XCConfigurationList', buildConfigurations=configs, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')
    target = add(name, 'PBXNativeTarget', buildConfigurationList=target_configs, buildPhases=phases, buildRules=[], dependencies=[], name=name, productName=name, productReference=product, productType='com.apple.product-type.application')
    targets.append(target)
    scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:Parkly.xcodeproj"/>
    </BuildActionEntry></BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables/></TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES">
    <BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:Parkly.xcodeproj"/></BuildableProductRunnable>
  </LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" useCustomWorkingDirectory="NO"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:Parkly.xcodeproj"/></BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
'''
    schemes = PROJECT / 'xcshareddata' / 'xcschemes'
    schemes.mkdir(parents=True, exist_ok=True)
    (schemes / (name + '.xcscheme')).write_text(scheme)

product_group = add('Products', 'PBXGroup', children=products, name='Products', sourceTree='<group>')
main_group = add('Main', 'PBXGroup', children=source_files + resources + list(config_refs.values()) + [product_group], sourceTree='<group>')
project = add('Project', 'PBXProject', attributes={'BuildIndependentTargetsInParallel': 'YES', 'LastUpgradeCheck': '1600'}, buildConfigurationList=config_list, compatibilityVersion='Xcode 14.0', developmentRegion='th', hasScannedForEncodings=0, knownRegions=['th', 'en', 'Base'], mainGroup=main_group, productRefGroup=product_group, projectDirPath='', projectRoot='', targets=targets)
(PROJECT / 'project.pbxproj').write_text('// !$*UTF8*$!\n' + openstep(dict(archiveVersion=1, classes={}, objectVersion=56, objects=OBJECTS, rootObject=project)) + '\n')

base_info = {
    'CFBundleDevelopmentRegion': 'th',
    'CFBundleDisplayName': '$(PARKLY_DISPLAY_NAME)',
    'CFBundleExecutable': '$(EXECUTABLE_NAME)',
    'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)',
    'CFBundleInfoDictionaryVersion': '6.0',
    'CFBundleName': '$(PRODUCT_NAME)',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '$(MARKETING_VERSION)',
    'CFBundleVersion': '$(CURRENT_PROJECT_VERSION)',
    'LSRequiresIPhoneOS': True,
    'UIApplicationSceneManifest': {'UIApplicationSupportsMultipleScenes': False},
    'UILaunchScreen': {},
    'UISupportedInterfaceOrientations': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
    'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
    'ParklyRole': '$(PARKLY_ROLE)',
    'ParklyServerURL': '$(PARKLY_SERVER_URL)',
    'NSLocalNetworkUsageDescription': 'เชื่อมต่อเซิร์ฟเวอร์ Parkly บนเครือข่ายเดียวกันเพื่อทดสอบแอพและเข้าใช้งานระบบลานจอด',
}
plist(ROOT / 'Config' / 'Debug-Info.plist', dict(base_info, NSAppTransportSecurity={'NSAllowsArbitraryLoadsInWebContent': True, 'NSAllowsLocalNetworking': True}))
plist(ROOT / 'Config' / 'Release-Info.plist', base_info)
plist(ROOT / 'Shared' / 'PrivacyInfo.xcprivacy', {
    'NSPrivacyTracking': False,
    'NSPrivacyTrackingDomains': [],
    'NSPrivacyAccessedAPITypes': [{'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults', 'NSPrivacyAccessedAPITypeReasons': ['CA92.1']}],
    'NSPrivacyCollectedDataTypes': [{
        'NSPrivacyCollectedDataType': name,
        'NSPrivacyCollectedDataTypeLinked': True,
        'NSPrivacyCollectedDataTypeTracking': False,
        'NSPrivacyCollectedDataTypePurposes': ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    } for name in ['NSPrivacyCollectedDataTypeName', 'NSPrivacyCollectedDataTypeEmailAddress', 'NSPrivacyCollectedDataTypeUserID', 'NSPrivacyCollectedDataTypeOtherUserContent', 'NSPrivacyCollectedDataTypePurchaseHistory']],
})
assets = ROOT / 'Shared' / 'Assets.xcassets'
assets.mkdir(exist_ok=True)
(assets / 'Contents.json').write_text(json.dumps({'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')
for role in ['Renter', 'Landlord', 'Admin']:
    directory = assets / ('AppIcon' + role + '.appiconset')
    directory.mkdir(exist_ok=True)
    (directory / 'Contents.json').write_text(json.dumps({'images': [{'filename': 'AppIcon.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}], 'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')
print('Generated Parkly.xcodeproj with Renter, Landlord and Admin schemes.')
