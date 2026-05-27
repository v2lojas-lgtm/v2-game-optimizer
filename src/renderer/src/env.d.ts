/// <reference types="vite/client" />

interface Window {
  api: {
    window: {
      minimize:    () => Promise<void>
      maximize:    () => Promise<void>
      close:       () => Promise<void>
      isMaximized: () => Promise<boolean>
    }
    python: {
      invoke:  (command: string, args?: unknown, timeoutMs?: number) => Promise<unknown>
      onEvent: (cb: (event: string, data: unknown) => void) => () => void
    }
    overlay: {
      toggle:          () => Promise<boolean>
      isOpen:          () => Promise<boolean>
      move:            (x: number, y: number) => Promise<void>
      setClickThrough: (through: boolean) => Promise<void>
      onStats:         (cb: (stats: unknown) => void) => () => void
    }
  }
}
