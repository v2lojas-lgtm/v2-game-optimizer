# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for V2 Game Optimizer Python sidecar.
# SPECPATH is the directory containing this spec file (python/).

import sys
from pathlib import Path

# SPECPATH is a PyInstaller global pointing to this spec file's directory.
src = Path(SPECPATH)  # noqa: F821 — injected by PyInstaller

a = Analysis(
    [str(src / 'main.py')],
    pathex=[str(src)],
    binaries=[],
    datas=[],
    hiddenimports=[
        # psutil internals
        'psutil',
        'psutil._pswindows',
        'psutil._psutil_windows',
        # pywin32 / wmi
        'win32api',
        'win32con',
        'win32security',
        'win32service',
        'win32process',
        'wmi',
        'pywintypes',
        # stdlib used dynamically
        'sqlite3',
        'json',
        'statistics',
        're',
        'pathlib',
        'subprocess',
        'winreg',
        # HTTP (usado pelo license.py para chamar o servidor de licença)
        'urllib.request',
        'urllib.parse',
        'http.client',
        'ssl',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'html', 'xml'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,   # stdin/stdout communication requires console mode
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
