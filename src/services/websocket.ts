import { Client, StompHeaders } from '@stomp/stompjs';
import type { IMessage } from '@stomp/stompjs';
import { getToken } from './api';

export class RoomSocketClient {
  private client: Client | null = null;
  private roomCode: string;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  
  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  connect(
    callbacks: {
      onConnect?: () => void;
      onDisconnect?: () => void;
      onSync?: (message: any) => void;
      onChat?: (message: any) => void;
      onParticipants?: (members: string[]) => void;
      onLocation?: (location: any) => void;
      onKicked?: () => void;
      onTyping?: (username: string, status: string) => void;
    }
  ) {
    const token = getToken();
    const headers: StompHeaders = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.onConnectCallback = callbacks.onConnect;
    this.onDisconnectCallback = callbacks.onDisconnect;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const wsBase = apiUrl.startsWith('https')
      ? apiUrl.replace(/^https/, 'wss')
      : apiUrl.replace(/^http/, 'ws');
    // Connect to Spring Boot WebSocket STOMP endpoint using native websockets
    this.client = new Client({
      brokerURL: `${wsBase}/ws-sync/websocket`,
      connectHeaders: headers,
      debug: (str) => {
        console.log('[STOMP]', str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = (frame) => {
      console.log('Connected to Stomp broker: ' + frame);
      if (this.onConnectCallback) this.onConnectCallback();

      // Subscribe to playback sync events
      if (callbacks.onSync) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/sync`, (message: IMessage) => {
          callbacks.onSync?.(JSON.parse(message.body));
        });
      }

      // Subscribe to chat messages
      if (callbacks.onChat) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/chat`, (message: IMessage) => {
          callbacks.onChat?.(JSON.parse(message.body));
        });
      }

      // Subscribe to active participants list
      if (callbacks.onParticipants) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/participants`, (message: IMessage) => {
          callbacks.onParticipants?.(JSON.parse(message.body));
        });
      }

      // Subscribe to live location updates
      if (callbacks.onLocation) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/location`, (message: IMessage) => {
          callbacks.onLocation?.(JSON.parse(message.body));
        });
      }

      // Subscribe to typing notifications
      if (callbacks.onTyping) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/typing/+*`, (message: IMessage) => {
          // Dynamic destination parsing: /topic/room/{code}/typing/{username}
          const destination = (message as any).destination;
          const parts = destination.split('/');
          const username = parts[parts.length - 1];
          callbacks.onTyping?.(username, message.body);
        });
        
        // Also subscribe with wildcards if broker allows, or listen to typing broker
        this.client?.subscribe(`/topic/room/${this.roomCode}/typing/**`, (message: IMessage) => {
          const destination = (message as any).destination;
          const parts = destination.split('/');
          const username = parts[parts.length - 1];
          callbacks.onTyping?.(username, message.body);
        });
      }

      // Subscribe to kick alerts specifically for the current logged-in user
      const currentUser = localStorage.getItem('username');
      if (currentUser && callbacks.onKicked) {
        this.client?.subscribe(`/topic/room/${this.roomCode}/kick/${currentUser}`, () => {
          callbacks.onKicked?.();
        });
      }

      // Send initial JOIN notice to trigger participants list update & JOIN announcement
      this.client?.publish({
        destination: `/app/room/${this.roomCode}/join`,
      });
    };

    this.client.onDisconnect = () => {
      console.log('Disconnected from Stomp broker');
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    };

    this.client.onStompError = (frame) => {
      console.error('Broker reported error: ' + frame.headers['message']);
      console.error('Additional details: ' + frame.body);
    };

    this.client.activate();
  }

  // Publish playback sync actions
  sendPlaybackSync(action: 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_VIDEO' | 'SYNC_STATE' | 'BUFFERING' | 'ERROR', currentTime: number, videoId?: number) {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/sync`,
        body: JSON.stringify({
          action,
          currentTime,
          videoId,
          clientTime: Date.now(),
        }),
      });
    }
  }

  // Publish chat message
  sendChatMessage(content: string, type: 'TEXT' | 'IMAGE' = 'TEXT') {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/chat`,
        body: JSON.stringify({
          content,
          type,
        }),
      });
    }
  }

  // Publish location coordinate updates
  sendLocationUpdate(latitude: number, longitude: number) {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/location`,
        body: JSON.stringify({
          latitude,
          longitude,
        }),
      });
    }
  }

  // Send typing notifications
  sendTypingStatus(status: 'typing' | 'stopped') {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/typing`,
        body: status,
      });
    }
  }

  // Publish kick user message (admin only)
  sendKickUser(targetUsername: string) {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/kick/${targetUsername}`,
      });
    }
  }

  // Report that this viewer has buffered N seconds of video.
  // The backend collates reports from all viewers and broadcasts
  // VIEWER_READY_STATUS to the admin so Play can be unlocked when everyone is ready.
  sendViewerReady(bufferedSeconds: number) {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/room/${this.roomCode}/viewer_ready`,
        body: JSON.stringify({ bufferedSeconds }),
      });
    }
  }

  disconnect() {
    if (this.client) {
      // Notify other room members we are leaving
      if (this.client.connected) {
        this.client.publish({
          destination: `/app/room/${this.roomCode}/leave`,
        });
      }
      this.client.deactivate();
      this.client = null;
    }
  }
}
