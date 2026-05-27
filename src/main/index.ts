import { app, shell, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, Notification, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { registerOverlayIpc, destroyOverlayWindow } from './overlay-window'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const pythonBridge = new PythonBridge()

// ── Tray icon ──────────────────────────────────────────────────────────────────

function getTrayIcon(): Electron.NativeImage {
  // Dev: use the small 32x32 tray PNG (resized to 16 for tray)
  // Prod: icon-tray.png copied via extraResources (2.8 KB vs 1.7 MB of original)
  const iconPath = is.dev
    ? join(process.cwd(), 'src/renderer/src/assets/icon-tray.png')
    : join(process.resourcesPath, 'icon-tray.png')
  try {
    const img = nativeImage.createFromPath(iconPath)
    return img.resize({ width: 16, height: 16 })
  } catch {
    return nativeImage.createEmpty()
  }
}

function buildTrayMenu(boostActive: boolean, gameName?: string) {
  return Menu.buildFromTemplate([
    {
      label: 'V2 Game Optimizer',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: boostActive
        ? `⚡ BOOST ATIVO — ${gameName ?? 'Jogo'}`
        : '○ Aguardando jogo...',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Abrir',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    {
      label: 'Sair',
      click: () => {
        app.quit()
      },
    },
  ])
}

function updateTray(boostActive: boolean, gameName?: string) {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu(boostActive, gameName))
  tray.setToolTip(
    boostActive
      ? `V2 Game Optimizer — ⚡ ${gameName} — BOOST ATIVO`
      : 'V2 Game Optimizer — Aguardando jogo'
  )
}

function createTray(): void {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('V2 Game Optimizer')
  tray.setContextMenu(buildTrayMenu(false))

  // Click on tray icon → show window
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

// ── Push event handler (from Python watcher) ───────────────────────────────────

function setupPushEvents(): void {
  pythonBridge.onEvent((event, data: any) => {
    // Forward to renderer
    mainWindow?.webContents.send('python:event', event, data)

    if (event === 'game_start') {
      const name = data?.name ?? 'Jogo'
      updateTray(true, name)

      // Windows notification
      if (Notification.isSupported()) {
        new Notification({
          title: '⚡ Boost Ativado',
          body: `${name} detectado — desempenho máximo aplicado`,
          silent: true,
          icon: getTrayIcon(),
        }).show()
      }
    }

    if (event === 'game_stop') {
      updateTray(false)

      if (Notification.isSupported()) {
        new Notification({
          title: 'V2 Game Optimizer',
          body: 'Jogo encerrado — configurações restauradas',
          silent: true,
          icon: getTrayIcon(),
        }).show()
      }
    }
  })
}

// ── Main window ────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#010723',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Close button → minimize to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC handlers ───────────────────────────────────────────────────────────────

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.hide()) // hides to tray
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())

ipcMain.handle('python:invoke', async (_event, command: string, args?: unknown, timeoutMs?: number) => {
  return pythonBridge.invoke(command, args, timeoutMs)
})

// ── App lifecycle ──────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var app: Electron.App & { isQuitting?: boolean }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.v2gameoptimizer')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  pythonBridge.start()
  setupPushEvents()
  registerOverlayIpc(pythonBridge)
  createWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    ipcMain.emit('overlay:toggle')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  destroyOverlayWindow()
  pythonBridge.stop()
  tray?.destroy()
  if (process.platform !== 'darwin') app.quit()
})
