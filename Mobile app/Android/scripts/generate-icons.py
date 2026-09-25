"""Generate three code-native vector icons; no image generator or bitmap tools needed."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'app/src/main/res/drawable'
letters = {
    'renter': ('#126D4F', 'M44,78 L44,97 L48,97 L48,90 L51,90 L56,97 L61,97 L55,89 C63,84 58,78 52,78 Z M48,82 L52,82 C56,82 56,86 52,86 L48,86 Z'),
    'landlord': ('#173F35', 'M45,78 L49,78 L49,93 L60,93 L60,97 L45,97 Z'),
    'admin': ('#213857', 'M44,97 L51,78 L56,78 L63,97 L59,97 L57,92 L50,92 L48,97 Z M51,88 L56,88 L53.5,82 Z'),
}
for role, (color, letter) in letters.items():
    xml = f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="{color}" android:pathData="M0,0 H108 V108 H0 Z" />
    <path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="M30,18 H55 C82,18 82,57 55,57 H42 V72 H30 Z M42,29 V46 H55 C66,46 66,29 55,29 Z" />
    <path android:fillColor="#EED68D" android:pathData="M39,75 H68 Q73,75 73,81 V96 Q73,101 68,101 H39 Q34,101 34,96 V81 Q34,75 39,75 Z" />
    <path android:fillColor="{color}" android:fillType="evenOdd" android:pathData="{letter}" />
</vector>
'''
    (root / ('ic_' + role + '.xml')).write_text(xml)
print('Created Renter, Landlord, Admin vector icons.')
