import { useState, useCallback } from 'react'

export function usePython<T = unknown>() {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invoke = useCallback(async (command: string, args?: unknown, timeoutMs?: number): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      if (!window.api?.python?.invoke) {
        throw new Error('Python bridge não disponível (executando fora do Electron)')
      }
      const result = await window.api.python.invoke(command, args, timeoutMs)
      setData(result as T)
      return result as T
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, invoke }
}
