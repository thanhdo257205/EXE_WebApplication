import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, Subject, tap, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface WatchRoomInfo {
  id: string;
  title: string;
  mode: 'SCHEDULED' | 'HOST_TRIGGER';
  scheduledAt: string | null;
  videoDuration: number;
  status: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'ENDED';
  streamUrl: string;
  videoSource?: string;
  snapshot: PlaybackSnapshot;
  viewerCount: number;
  isHost: boolean;
  hostToken?: string;
}

export interface PlaybackSnapshot {
  status: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'ENDED';
  position: number;
  serverTime: number;
  countdownSeconds: number | null;
  startedAt: string | null;
}

export interface DanmakuItem {
  id: string;
  roomId?: string;
  nickname: string;
  text: string;
  timeOffset: number;
  phase?: 'LOBBY' | 'VIDEO';
  color: string;
  createdAt: string;
}

/** Someone currently connected to the room (public fields only). */
export interface RoomViewer {
  id: string;
  nickname: string;
  isHost: boolean;
}

export interface CreateRoomDto {
  title: string;
  videoSource: string;
  videoDuration?: number;
  mode: 'SCHEDULED' | 'HOST_TRIGGER';
  scheduledAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class WatchRoomService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly currentRoom = signal<WatchRoomInfo | null>(null);
  readonly playbackSnapshot = signal<PlaybackSnapshot | null>(null);
  readonly viewerCount = signal<number>(1);
  /** Live list of people in the room (host first), pushed by the server on join/leave/rename. */
  readonly viewers = signal<RoomViewer[]>([]);
  /** This connection's id in `viewers`, to mark "bạn". */
  readonly myViewerId = signal<string | null>(null);
  readonly isHost = signal<boolean>(false);
  readonly connectionStatus = signal<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');
  readonly serverClockOffsetMs = signal<number>(0);
  readonly lastError = signal<string>('');

  readonly newDanmaku$ = new Subject<DanmakuItem>();
  readonly deletedDanmaku$ = new Subject<string>();
  readonly videoChanged$ = new Subject<void>();
  readonly playbackSync$ = new Subject<{ action: string; snapshot: PlaybackSnapshot }>();

  private ws: WebSocket | null = null;
  private pingTimer: any = null;
  private reconnectTimer: any = null;
  private currentRoomId: string | null = null;
  private currentNickname = 'Khách';
  private currentHostToken: string | null = null;
  private isExplicitDisconnect = false;

  private get base() {
    const api = environment.apiBaseUrl || '/api';
    return `${api}/v1`;
  }

  createRoom(dto: CreateRoomDto): Observable<{ id: string; title: string; hostToken: string; roomUrl: string }> {
    return this.auth.getCsrf().pipe(
      switchMap(csrf =>
        this.http.post<{ id: string; title: string; hostToken: string; roomUrl: string }>(
          `${this.base}/admin/watch-rooms`,
          dto,
          { headers: new HttpHeaders({ [csrf.headerName]: csrf.token, 'Content-Type': 'application/json' }), withCredentials: true }
        )
      )
    );
  }

  getRoom(id: string, hostToken?: string): Observable<WatchRoomInfo> {
    let headers = new HttpHeaders();
    if (hostToken) {
      headers = headers.set('X-Host-Token', hostToken);
    }
    return this.http.get<WatchRoomInfo>(`${this.base}/watch-rooms/${id}`, {
      headers,
      withCredentials: true,
    }).pipe(
      tap(room => {
        this.currentRoom.set(room);
        this.playbackSnapshot.set(room.snapshot);
        this.serverClockOffsetMs.set(room.snapshot.serverTime - Date.now());
        this.viewerCount.set(room.viewerCount || 1);
        this.isHost.set(Boolean(room.isHost));
        if (room.hostToken) {
          this.setStoredHostToken(room.id, room.hostToken);
        }
      })
    );
  }

  changeVideo(id: string, videoSource: string, videoDuration = 0): Observable<WatchRoomInfo> {
    return this.auth.getCsrf().pipe(
      switchMap(csrf => this.http.put(`${this.base}/admin/watch-rooms/${id}/video`, { videoSource, videoDuration }, {
        withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })),
      switchMap(() => this.getRoom(id, this.currentHostToken || undefined)),
      tap(() => this.videoChanged$.next()),
    );
  }

  getDanmakuHistory(id: string): Observable<DanmakuItem[]> {
    return this.http.get<DanmakuItem[]>(`${this.base}/watch-rooms/${id}/danmaku`, {
      withCredentials: true,
    });
  }

  getStoredHostToken(roomId: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(`watch_room_host_${roomId}`);
    } catch {
      return null;
    }
  }

  setStoredHostToken(roomId: string, token: string) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`watch_room_host_${roomId}`, token);
    } catch {}
  }

  connectWebSocket(roomId: string, nickname: string, hostToken?: string) {
    if (typeof window === 'undefined') return;
    this.isExplicitDisconnect = false;
    this.currentRoomId = roomId;
    this.currentNickname = nickname || 'Khách';
    this.currentHostToken = hostToken || this.getStoredHostToken(roomId);

    this.disconnect(false);
    this.connectionStatus.set('CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/room`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connectionStatus.set('CONNECTED');
        this.sendWsMessage({
          type: 'join',
          roomId: this.currentRoomId,
          nickname: this.currentNickname,
          hostToken: this.currentHostToken || undefined,
        });

        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingWsMessage(msg);
        } catch (err) {
          console.error('WS message parse error', err);
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (!this.isExplicitDisconnect) {
          this.connectionStatus.set('RECONNECTING');
          this.scheduleReconnect();
        } else {
          this.connectionStatus.set('DISCONNECTED');
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Watch room WS error', err);
      };
    } catch (err) {
      console.error('Failed to create WebSocket', err);
      this.scheduleReconnect();
    }
  }

  private handleIncomingWsMessage(msg: any) {
    if (msg.type === 'video:changed' && this.currentRoomId) {
      this.getRoom(this.currentRoomId, this.currentHostToken || undefined).subscribe({
        next: () => this.videoChanged$.next(),
        error: () => this.lastError.set('Video đã thay đổi. Vui lòng tải lại phòng.'),
      });
      return;
    }
    if (msg.type === 'error') {
      this.lastError.set(msg.code === 'RATE_LIMITED' ? 'Vui lòng chờ 1,5 giây giữa các bình luận.'
        : msg.code === 'NICKNAME_REQUIRED' ? 'Vui lòng nhập tên trước khi vào phòng.'
        : 'Không thể thực hiện thao tác. Vui lòng thử lại.');
      return;
    }
    if (msg.type === 'pong') {
      const t1 = Date.now();
      const t0 = msg.t0;
      const serverTime = msg.serverTime;
      const rtt = Math.max(0, t1 - t0);
      const estimatedServerTimeAtT1 = serverTime + (rtt / 2);
      const offset = estimatedServerTimeAtT1 - t1;

      // Smooth clock skew rolling average
      const current = this.serverClockOffsetMs();
      const smoothed = current === 0 ? offset : Math.round((current * 0.7) + (offset * 0.3));
      this.serverClockOffsetMs.set(smoothed);
      return;
    }

    if (msg.type === 'room_snapshot') {
      this.lastError.set('');
      this.playbackSnapshot.set(msg.snapshot);
      if (typeof msg.viewerCount === 'number') {
        this.viewerCount.set(msg.viewerCount);
      }
      if (msg.isHost !== undefined) {
        this.isHost.set(Boolean(msg.isHost));
      }
      if (typeof msg.viewerId === 'string') this.myViewerId.set(msg.viewerId);
      if (this.currentRoomId) this.getRoom(this.currentRoomId, this.currentHostToken || undefined).subscribe({
        next: () => this.videoChanged$.next(), error: () => {},
      });
      return;
    }

    if (msg.type === 'viewer_count') {
      this.viewerCount.set(msg.count);
      if (Array.isArray(msg.viewers)) this.viewers.set(msg.viewers);
      return;
    }

    if (msg.type === 'renamed' && typeof msg.nickname === 'string') {
      this.currentNickname = msg.nickname;
      return;
    }

    if (msg.type === 'danmaku:new') {
      this.newDanmaku$.next(msg.danmaku);
      return;
    }

    if (msg.type === 'danmaku:delete') {
      this.deletedDanmaku$.next(msg.danmakuId);
      return;
    }

    if (msg.type === 'sync') {
      if (this.playbackSnapshot() && msg.snapshot.serverTime < this.playbackSnapshot()!.serverTime) return;
      this.playbackSnapshot.set(msg.snapshot);
      this.playbackSync$.next({ action: msg.action, snapshot: msg.snapshot });
      return;
    }
  }

  private startPing() {
    this.stopPing();
    const sendPing = () => {
      this.sendWsMessage({ type: 'ping', t0: Date.now() });
    };
    sendPing();
    this.pingTimer = setInterval(sendPing, 4000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.isExplicitDisconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentRoomId && !this.isExplicitDisconnect) {
        this.connectWebSocket(this.currentRoomId, this.currentNickname, this.currentHostToken || undefined);
      }
    }, 2500);
  }

  /** Change this viewer's name for the list and for later danmaku (also kept for reconnects). */
  rename(nickname: string) {
    const name = nickname.trim();
    if (!name) return;
    this.currentNickname = name;
    this.sendWsMessage({ type: 'rename', nickname: name });
  }

  sendDanmaku(text: string, timeOffset: number, color = '#ffffff') {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.lastError.set('Đang kết nối lại. Vui lòng chờ trước khi gửi bình luận.');
      return false;
    }
    this.lastError.set('');
    this.sendWsMessage({
      type: 'danmaku:send',
      text,
      timeOffset,
      color,
    });
    return true;
  }

  sendHostControl(action: 'START' | 'PAUSE' | 'RESUME' | 'SEEK', position?: number) {
    const hostToken = this.currentHostToken || this.currentRoom()?.hostToken;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWsMessage({ type: 'host:control', action, position, hostToken });
      return;
    }

    // REST is used only when the socket is unavailable, avoiding duplicate controls.
    if (this.currentRoomId) {
      let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      if (hostToken) headers = headers.set('X-Host-Token', hostToken);

      this.http.post<{ ok: boolean; snapshot: PlaybackSnapshot }>(
        `${this.base}/watch-rooms/${this.currentRoomId}/control`,
        { action, position, hostToken },
        { headers, withCredentials: true }
      ).subscribe({
        next: res => {
          if (res.snapshot) {
            this.playbackSnapshot.set(res.snapshot);
          }
        },
        error: () => this.lastError.set('Không thể điều khiển phòng. Vui lòng thử lại.')
      });
    }
  }

  deleteDanmaku(danmakuId: string) {
    const hostToken = this.currentHostToken || this.currentRoom()?.hostToken;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWsMessage({ type: 'host:delete_danmaku', danmakuId, hostToken });
      return;
    }

    if (this.currentRoomId) {
      let headers = new HttpHeaders();
      if (hostToken) headers = headers.set('X-Host-Token', hostToken);
      this.http.delete(`${this.base}/watch-rooms/${this.currentRoomId}/danmaku/${danmakuId}`, {
        headers,
        withCredentials: true,
      }).subscribe({ error: () => {} });
    }
  }

  private sendWsMessage(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  disconnect(explicit = true) {
    this.isExplicitDisconnect = explicit;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    if (explicit) {
      this.viewers.set([]);
      this.myViewerId.set(null);
      this.connectionStatus.set('DISCONNECTED');
      this.currentRoom.set(null);
      this.playbackSnapshot.set(null);
      this.isHost.set(false);
      this.lastError.set('');
    }
  }

  /**
   * Helper to calculate the target playback position right now given server snapshot
   */
  getLivePlaybackSnapshot(nowMs = Date.now()): PlaybackSnapshot | null {
    const snap = this.playbackSnapshot();
    if (!snap) return null;
    const serverNow = nowMs + this.serverClockOffsetMs();
    const room = this.currentRoom();
    if (snap.status === 'LOBBY' && room?.mode === 'SCHEDULED' && room.scheduledAt) {
      const scheduledMs = Date.parse(room.scheduledAt);
      if (serverNow < scheduledMs) return { ...snap, countdownSeconds: Math.ceil((scheduledMs - serverNow) / 1000) };
      const position = Math.max(0, (serverNow - scheduledMs) / 1000);
      const duration = room.videoDuration > 0 ? room.videoDuration : Infinity;
      return { status: position >= duration ? 'ENDED' : 'PLAYING', position: Math.min(position, duration),
        serverTime: serverNow, countdownSeconds: null, startedAt: room.scheduledAt };
    }
    if (snap.status !== 'PLAYING') return snap;
    const position = snap.position + Math.max(0, (serverNow - snap.serverTime) / 1000);
    const duration = room && room.videoDuration > 0 ? room.videoDuration : Infinity;
    return { ...snap, status: position >= duration ? 'ENDED' : 'PLAYING', position: Math.min(position, duration), serverTime: serverNow };
  }

  getSynchronizedTargetPosition(snap = this.getLivePlaybackSnapshot()): number {
    if (!snap) return 0;
    if (snap.status === 'LOBBY') return 0;
    if (snap.status === 'PAUSED' || snap.status === 'ENDED') return snap.position;

    return snap.position;
  }
}
