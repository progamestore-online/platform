import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The shape of a server message handled by a game. Games narrow this with
 * their own message types via the generic parameter:
 *
 *   type ChessMsg = { type: 'move'; uci: string } | { type: 'state'; fen: string };
 *   const room = useRooms<ChessMsg>({ ... });
 */
export type RoomMessage = { type: string; [k: string]: unknown };

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export interface UseRoomsOptions<TServer extends RoomMessage> {
  /**
   * A namespace identifying the game. Today this is mostly a label for
   * the URL; the multiplayer Worker is per-game so a single Worker only
   * serves one `gameId`. Reserved as a hook input so games written
   * against this API don't break if the platform ever moves to a shared
   * rooms Worker that namespaces by game.
   */
  gameId: string;

  /**
   * The room to connect to. `null` keeps the hook idle — useful before
   * the user has either created a new room or joined an existing one.
   */
  roomId: string | null;

  /**
   * Base URL of the multiplayer Worker. Defaults to same-origin, which
   * is the layout the templates ship: one Worker serves the static SPA
   * AND owns the WebSocket route. Override only if you split the two.
   */
  baseUrl?: string;

  /**
   * Called for every JSON-parsed message received from the room.
   * Use the `TServer` type parameter to narrow.
   */
  onMessage?: (msg: TServer) => void;

  /**
   * Called on transitions of the connection status. Useful for UI
   * (showing a "reconnecting…" badge, disabling Send while not
   * connected, etc.).
   */
  onStatusChange?: (status: RoomStatus) => void;
}

export interface UseRoomsResult<TClient extends RoomMessage> {
  /** Current connection status. */
  status: RoomStatus;

  /**
   * Send a message to the room. JSON-encoded and pushed to the server.
   * Messages sent while the socket isn't open are dropped — the hook
   * does not queue. Most game protocols are stateful enough that
   * silent retries on a stale connection cause more bugs than they fix.
   */
  send: (msg: TClient) => void;

  /**
   * POST `/api/rooms/new` against the Worker and return the new room id.
   * Throws on non-2xx. The hook does not auto-connect to the returned
   * id — call sites should navigate / set state and let the hook
   * pick up the new `roomId` prop.
   */
  create: () => Promise<string>;
}

/**
 * Connect to a server-authoritative multiplayer room.
 *
 * The platform's multiplayer model is "WebSocket to a Durable Object owned
 * by the game's own Worker". This hook handles the connection lifecycle
 * (open / message / close) and the `POST /api/rooms/new` call to mint
 * room ids. Per-game protocol — what messages mean, what state looks like,
 * how moves get validated — lives in the game's Worker code, not here.
 *
 * Why this is a Pro-only API: the Worker + DO + per-GB-second billing
 * pricing model means hosting rooms isn't free for the platform.
 */
export function useRooms<
  TServer extends RoomMessage = RoomMessage,
  TClient extends RoomMessage = RoomMessage,
>(opts: UseRoomsOptions<TServer>): UseRoomsResult<TClient> {
  const { gameId, roomId, baseUrl, onMessage, onStatusChange } = opts;
  const [status, setStatus] = useState<RoomStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  // Refs so the connect-effect doesn't re-fire when these change.
  const onMessageRef = useRef(onMessage);
  const onStatusChangeRef = useRef(onStatusChange);
  onMessageRef.current = onMessage;
  onStatusChangeRef.current = onStatusChange;

  const setStatusAndNotify = useCallback((s: RoomStatus) => {
    setStatus(s);
    onStatusChangeRef.current?.(s);
  }, []);

  // (Re)connect when roomId changes.
  useEffect(() => {
    if (roomId === null) {
      setStatusAndNotify('idle');
      return;
    }

    setStatusAndNotify('connecting');
    // Build wss:// URL from the page's origin (or the override baseUrl).
    const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
    const wsUrl =
      base.replace(/^http/, 'ws').replace(/\/$/, '') +
      `/api/rooms/${encodeURIComponent(roomId)}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let closedCleanly = false;

    ws.addEventListener('open', () => {
      setStatusAndNotify('connected');
    });
    ws.addEventListener('message', (e) => {
      let parsed: TServer;
      try {
        parsed = JSON.parse(e.data) as TServer;
      } catch {
        // Non-JSON message — ignore. The protocol contract is JSON.
        return;
      }
      onMessageRef.current?.(parsed);
    });
    ws.addEventListener('close', () => {
      if (!closedCleanly) setStatusAndNotify('closed');
    });
    ws.addEventListener('error', () => {
      setStatusAndNotify('error');
    });

    return () => {
      closedCleanly = true;
      wsRef.current = null;
      // 1000 = normal closure. No reconnect — the next mount or roomId
      // change will create a fresh socket.
      try {
        ws.close(1000);
      } catch {
        // Worth a console hint? No — socket may already be closed.
      }
    };
    // gameId is intentionally not in deps — the URL doesn't reference
    // it today (per-game Worker = the gameId is implicit in the
    // baseUrl). If/when the platform switches to a shared rooms Worker
    // that namespaces by gameId in the path, add gameId to deps then.
  }, [roomId, baseUrl, setStatusAndNotify]);

  const send = useCallback((msg: TClient) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const create = useCallback(async (): Promise<string> => {
    const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
    const res = await fetch(`${base.replace(/\/$/, '')}/api/rooms/new`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(`POST /api/rooms/new → ${res.status}`);
    }
    const data = (await res.json()) as { roomId?: string; id?: string };
    // Tolerate either { roomId } or { id } from the Worker — the docs
    // settle on `roomId`, but some early templates returned `id`.
    const id = data.roomId ?? data.id;
    if (!id || typeof id !== 'string') {
      throw new Error('Worker returned no roomId');
    }
    return id;
  }, [baseUrl]);

  return { status, send, create };
}
