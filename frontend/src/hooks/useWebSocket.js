import { useEffect, useRef, useCallback } from 'react'

// useWebSocket — connects to the IMS WebSocket live feed.
// Calls onMessage(msg) for every incoming message.
// Auto-reconnects with exponential backoff on disconnect.
export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const retryDelay = useRef(1000)
  const isMounted = useRef(true)

  const connect = useCallback(() => {
    if (!isMounted.current) return

    const token = localStorage.getItem('ims_token')
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/ws/incidents${token ? `?token=${token}` : ''}`

    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => {
      retryDelay.current = 1000 // reset backoff on successful connect
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type !== 'ping') {
          onMessage(msg)
        }
      } catch (_) {}
    }

    socket.onclose = () => {
      if (!isMounted.current) return
      // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
      setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
        connect()
      }, retryDelay.current)
    }

    socket.onerror = () => {
      socket.close()
    }
  }, [onMessage])

  useEffect(() => {
    isMounted.current = true
    connect()
    return () => {
      isMounted.current = false
      ws.current?.close()
    }
  }, [connect])
}
