# -*- mode: python ; coding: utf-8 -*-

block_cipher = None


a = Analysis(['cycler_wrapper_zerorpc.py'],
             pathex=['D:\\Box Sync\\Documents\\SoftwareProjects\\CellCycleCounter_Electron\\cycler_venv\\Lib\\site-packages\\sklearn\\.libs',
             'D:\\Box Sync\\Documents\\SoftwareProjects\\CellCycleCounter_Electron\\gui\\src\\python',
             'D:\\SyncDocuments\\SoftwareProjects\\CellCycleCounter_Electron\\cycler_venv\\Lib\\site-packages\\sklearn\\.libs',
             'D:\\SyncDocuments\\SoftwareProjects\\CellCycleCounter_Electron\\gui\\src\\python'
             ],
             binaries=[],
             datas=[],
             hiddenimports=["sklearn.neighbors._typedefs", "sklearn.utils._cython_blas"],
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)
pyz = PYZ(a.pure, a.zipped_data,
             cipher=block_cipher)
exe = EXE(pyz,
          a.scripts,
          [],
          exclude_binaries=True,
          name='cycler_wrapper_zerorpc',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True,
          console=True )
coll = COLLECT(exe,
               a.binaries,
               a.zipfiles,
               a.datas,
               strip=False,
               upx=True,
               upx_exclude=[],
               name='cycler_wrapper_zerorpc')
