import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'

let overlayWin: BrowserWindow | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

export function createOverlayWindow(pythonBridge: PythonBridge): void {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.focus()
    return
  }

  const { width } = screen.getPrimaryDisplay().workAreaSize

  overlayWin = new BrowserWindow({
    width: 192,
    height: 200,
    x: width - 208,
    y: 16,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // Click-through — mouse events pass to the game underneath
  overlayWin.setIgnoreMouseEvents(true, { forward: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/overlay')
  } else {
    overlayWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
  }

  overlayWin.on('closed', () => {
    overlayWin = null
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  })

  // Start polling stats and pushing to overlay
  pollInterval = setInterval(async () => {
    if (!overlayWin || overlayWin.isDestroyed()) return
    try {
      const stats = await pythonBridge.invoke('quick_stats')
      if (!overlayWin.isDestroyed()) {
        overlayWin.webContents.send('overlay:stats', stats)
      }
    } catch { /* ignore */ }
  }, 1000)
}

export function destroyOverlayWindow(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  overlayWin?.close()
  overlayWin = null
}

export function isOverlayOpen(): boolean {
  return !!overlayWin && !overlayWin.isDestroyed()
}

export function registerOverlayIpc(pythonBridge: PythonBridge): void {
  ipcMain.handle('overlay:toggle', () => {
    if (isOverlayOpen()) {
      destroyOverlayWindow()
      return false
    } else {
      createOverlayWindow(pythonBridge)
      return true
    }
  })

  ipcMain.handle('overlay:isOpen', () => isOverlayOpen())

  // Allow overlay to move itself (drag handle)
  ipcMain.handle('overlay:move', (_event, x: number, y: number) => {
    overlayWin?.setPosition(Math.round(x), Math.round(y))
  })

  // Let overlay re-enable mouse events temporarily (for drag)
  ipcMain.handle('overlay:setClickThrough', (_event, through: boolean) => {
    overlayWin?.setIgnoreMouseEvents(through, { forward: true })
  })
}
