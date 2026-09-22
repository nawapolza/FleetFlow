import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiOrigin, getToken } from '../api.js';

export function useRealtime(onUpdate, enabled = true) {
  const callbackRef = useRef(onUpdate);
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState(null);

  useEffect(() => { callbackRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = io(getApiOrigin(), {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('realtime:update', (payload) => {
      setLastEventAt(payload?.at || new Date().toISOString());
      callbackRef.current?.(payload);
    });

    return () => socket.close();
  }, [enabled]);

  return { connected, lastEventAt };
}
