import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  window: {
    minimize:    () => ipcRenderer.invoke('window:minimize'),
    maximize:    () => ipcRenderer.invoke('window:maximize'),
    close:       () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Python sidecar bridge
  python: {
    invoke: (command: string, args?: unknown, timeoutMs?: number) =>
      ipcRenderer.invoke('python:invoke', command, args, timeoutMs),

    /** Subscribe to push events from Python (game_start, game_stop, etc.) */
    onEvent: (cb: (event: string, data: unknown) => void) => {
      const handler = (_: unknown, event: string, data: unknown) => cb(event, data)
      ipcRenderer.on('python:event', handler)
      return () => ipcRenderer.removeListener('python:event', handler)
    },
  },

  // Overlay controls
  overlay: {
    toggle:          () => ipcRenderer.invoke('overlay:toggle'),
    isOpen:          () => ipcRenderer.invoke('overlay:isOpen'),
    move:            (x: number, y: number) => ipcRenderer.invoke('overlay:move', x, y),
    setClickThrough: (through: boolean) => ipcRenderer.invoke('overlay:setClickThrough', through),
    onStats:         (cb: (stats: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => cb(data)
      ipcRenderer.on('overlay:stats', handler)
      return () => ipcRenderer.removeListener('overlay:stats', handler)
    },
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
