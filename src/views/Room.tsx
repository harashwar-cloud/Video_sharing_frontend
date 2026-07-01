import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  Tv, Users, Send, Image, Smile, MapPin, BarChart2, MessageSquare,
  LogOut, Copy, Check, Play, CheckCircle2, Clock, Download, FolderOpen,
  RefreshCw, Film, ShieldCheck, ShieldX, Clapperboard, Monitor
} from 'lucide-react';

import { api, getRole, getUsername } from '../services/api';
import { RoomSocketClient } from '../services/websocket';
import { VideoPlayer } from '../components/VideoPlayer';

// Fix Leaflet Default Icon issue in React bundles
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom pulse icon for location markers
const createPulseIcon = () => {
  return L.divIcon({
    html: `<div class="map-marker-pulse">
             <div class="w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
           </div>`,
    className: 'custom-div-icon',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
};

// Global Mock Locations list for testing Leaflet maps
const MOCK_LOCATIONS = [
  { name: 'New York, US', lat: 40.7128, lng: -74.0060 },
  { name: 'London, UK', lat: 51.5074, lng: -0.1278 },
  { name: 'Tokyo, JP', lat: 35.6762, lng: 139.6503 },
  { name: 'Sydney, AU', lat: -33.8688, lng: 151.2093 },
  { name: 'Paris, FR', lat: 48.8566, lng: 2.3522 },
  { name: 'Mumbai, IN', lat: 19.0760, lng: 72.8777 },
];

const formatDuration = (sec: number) => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

type VerificationStatus = 'unselected' | 'verifying' | 'correct' | 'wrong';

interface VerificationDetails {
  nameMatch: boolean;
  sizeMatch: boolean;
  durationMatch: boolean;
  checksumMatch: boolean | null;
  fileName: string;
  fileSize: number;
  fileDuration: number;
  fileMimeType: string;
  fileChecksum: string;
}

export const Room: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const roomCode = code || '';

  const username = getUsername() || '';
  const role = getRole();
  const isAdmin = role === 'ROLE_ADMIN';

  // Refs
  const socketClientRef = useRef<RoomSocketClient | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideoObjectUrlRef = useRef<string | null>(null);

  // Room states
  const [room, setRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [viewerLocations, setViewerLocations] = useState<Record<string, any>>({});

  // Real-time synchronization state
  const [syncState, setSyncState] = useState<{
    action: 'PLAY' | 'PAUSE' | 'SEEK' | 'BUFFERING' | 'ERROR' | 'CHANGE_VIDEO' | 'SYNC_STATE';
    playing: boolean;
    currentTime: number;
    updatedAt: number;
  } | undefined>(undefined);

  // Analytics state
  const [analytics, setAnalytics] = useState<any>({
    activeViewers: 1,
    peakUsers: 1,
    averageLatency: 15.0,
    playbackStatus: 'IDLE',
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'chat' | 'map' | 'analytics'>('chat');
  const [copied, setCopied] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoLibrary, setVideoLibrary] = useState<any[]>([]);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);

  const [videoModalView, setVideoModalView] = useState<'options' | 'library'>('options');
  const [isProcessingHostFile, setIsProcessingHostFile] = useState(false);
  const hostLocalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showVideoModal) {
      setVideoModalView('options');
    }
  }, [showVideoModal]);

  // Local video state (new workflow)
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('unselected');
  const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Viewer readiness state
  const [viewerReadyStatus, setViewerReadyStatus] = useState<{
    readyViewers: number;
    totalViewers: number;
    allReady: boolean;
    viewers: { username: string; bufferedSeconds: number; isReady: boolean }[];
  } | null>(null);
  const [isWaitingForViewers, setIsWaitingForViewers] = useState(false);
  const viewerWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local video state when video changes
  useEffect(() => {
    setVerificationStatus('unselected');
    setVerificationDetails(null);
    setSelectedFileName('');
    setViewerReadyStatus(null);
    setIsWaitingForViewers(true);

    // Revoke previous object URL
    if (localVideoObjectUrlRef.current) {
      URL.revokeObjectURL(localVideoObjectUrlRef.current);
      localVideoObjectUrlRef.current = null;
    }
    setLocalVideoUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.currentVideo?.id]);

  // Location options state
  const [useMockLocation, setUseMockLocation] = useState(false);
  const [selectedMockIndex, setSelectedMockIndex] = useState(0);

  // Fetch initial room info and chat logs
  const loadRoomInfo = async () => {
    try {
      const roomDetails = await api.getRoomDetails(roomCode);
      setRoom(roomDetails);

      const chatHistory = await api.getChatHistory(roomCode);
      setChatMessages(chatHistory);

      const currentParticipants = await api.getParticipants(roomCode);
      setParticipants(currentParticipants);

      const stats = await api.getAnalytics(roomCode);
      setAnalytics(stats);

      const apiBase = import.meta.env.VITE_API_URL;
      const stateResponse = await fetch(`${apiBase}/api/rooms/join/${roomCode}`, {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (stateResponse.ok) {
         const playState = await fetch(`${apiBase}/api/rooms/${roomCode}/analytics`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
         }).then(r => r.json());

         setSyncState({
            action: playState.playbackStatus === 'PLAYING' ? 'PLAY' : 'PAUSE',
            playing: playState.playbackStatus === 'PLAYING',
            currentTime: 0.0,
            updatedAt: Date.now()
          });
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to load room details.');
      navigate('/dashboard');
    }
  };

  const loadVideoLibrary = async () => {
    try {
      const vids = await api.getVideos();
      setVideoLibrary(vids);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRoomInfo();
    if (isAdmin) loadVideoLibrary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Connect WebSockets
  useEffect(() => {
    const socketClient = new RoomSocketClient(roomCode);
    socketClientRef.current = socketClient;

    socketClient.connect({
      onConnect: () => { console.log('WS Connection complete'); },
      onDisconnect: () => { console.log('WS Disconnected'); },
      onSync: (msg) => {
        if (msg.type === 'VIEWER_READY_STATUS') {
          setViewerReadyStatus(msg);
          if (msg.allReady) {
            if (viewerWaitTimeoutRef.current) clearTimeout(viewerWaitTimeoutRef.current);
            setIsWaitingForViewers(false);
          }
          return;
        }
        if (msg.action === 'CHANGE_VIDEO') {
          loadRoomInfo();
        } else {
          setSyncState((prev) => {
            let playing: boolean;
            if (msg.action === 'PLAY') playing = true;
            else if (msg.action === 'PAUSE') playing = false;
            else if (msg.playing !== undefined) playing = msg.playing;
            else playing = prev?.playing ?? false;

            return { action: msg.action, playing, currentTime: msg.currentTime, updatedAt: Date.now() };
          });
        }
      },
      onChat: (msg) => { setChatMessages((prev) => [...prev, msg]); },
      onParticipants: (members) => { setParticipants(members); },
      onLocation: (loc) => {
        setViewerLocations((prev) => ({ ...prev, [loc.username]: loc }));
      },
      onTyping: (typer, status) => {
        if (typer === username) return;
        setTypingUsers((prev) => ({ ...prev, [typer]: status === 'typing' }));
      },
      onKicked: () => {
        alert('You have been kicked from the room by the host.');
        navigate('/dashboard');
      },
    });

    return () => { socketClient.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Location Reporting
  useEffect(() => {
    const reportLocation = () => {
      if (!socketClientRef.current) return;
      if (useMockLocation) {
        const mock = MOCK_LOCATIONS[selectedMockIndex];
        socketClientRef.current.sendLocationUpdate(mock.lat, mock.lng);
      } else {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => { socketClientRef.current?.sendLocationUpdate(pos.coords.latitude, pos.coords.longitude); },
            () => { console.warn('GPS permission denied.'); }
          );
        }
      }
    };
    reportLocation();
    const interval = setInterval(reportLocation, 10000);
    return () => clearInterval(interval);
  }, [useMockLocation, selectedMockIndex]);

  // Poll Analytics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await api.getAnalytics(roomCode);
        setAnalytics(stats);
      } catch { /* silent */ }
    };
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [roomCode]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlaybackChange = (action: 'PLAY' | 'PAUSE' | 'SEEK' | 'BUFFERING' | 'ERROR', time: number) => {
    if (!isAdmin) return;
    socketClientRef.current?.sendPlaybackSync(action, time);
  };

  const handleSelectVideo = async (videoId: number) => {
    try {
      await api.changeVideo(roomCode, videoId);
      socketClientRef.current?.sendPlaybackSync('CHANGE_VIDEO', 0, videoId);
      setShowVideoModal(false);
      await loadRoomInfo();

      // Automatically trigger local file selection for the admin/host
      if (isAdmin) {
        setTimeout(() => {
          if (videoFileInputRef.current) {
            console.log("[Select Video] Automatically triggering local file selection for host...");
            videoFileInputRef.current.click();
          }
        }, 300);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to change video');
    }
  };

  const handleKickUser = (target: string) => {
    if (!isAdmin) return;
    if (window.confirm(`Kick user ${target} from the room?`)) {
      socketClientRef.current?.sendKickUser(target);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketClientRef.current?.sendChatMessage(chatInput.trim(), 'TEXT');
    socketClientRef.current?.sendTypingStatus('stopped');
    setChatInput('');
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);
    socketClientRef.current?.sendTypingStatus('typing');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { socketClientRef.current?.sendTypingStatus('stopped'); }, 2000);
  };

  const handleEmojiClick = (emoji: string) => {
    setChatInput((prev) => prev + emoji);
    setIsEmojiOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { socketClientRef.current?.sendChatMessage(reader.result as string, 'IMAGE'); };
    reader.readAsDataURL(file);
  };

  const handleExitRoom = async () => {
    if (isAdmin) {
      if (window.confirm('Ending session will close the room for everyone. Proceed?')) {
        try { await api.endSession(roomCode); } catch {}
      }
    }
    navigate('/dashboard');
  };

  // ── New workflow: Native Browser Download ──────────────────────────────────
  const handleDownloadVideo = () => {
    const vid = room?.currentVideo;
    if (!vid) return;
    const apiBase = import.meta.env.VITE_API_URL;
    const downloadUrl = vid.downloadUrl
      || (vid.source === 'drive' && vid.driveFileId
          ? `${apiBase}/api/drive/stream/${vid.driveFileId}`
          : `${apiBase}/api/videos/${vid.id}/stream`);
    window.open(downloadUrl, '_blank');
  };

  // ── New workflow: File Verification ────────────────────────────────────────
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        video.src = '';
        resolve(0);
      }, 3000);
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        const dur = video.duration;
        URL.revokeObjectURL(url);
        video.src = '';
        resolve(dur);
      };
      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        video.src = '';
        resolve(0);
      };
      video.src = url;
    });
  };

  const computeSHA256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getVideoMetadata = (file: File): Promise<{ duration: number; resolution: string }> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        video.src = '';
        resolve({ duration: 0, resolution: 'Unknown' });
      }, 3000);
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        const dur = video.duration;
        const res = video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : 'Unknown';
        URL.revokeObjectURL(url);
        video.src = '';
        resolve({ duration: dur, resolution: res });
      };
      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        video.src = '';
        resolve({ duration: 0, resolution: 'Unknown' });
      };
      video.src = url;
    });
  };

  const handleHostLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingHostFile(true);
    try {
      console.log("[Host Local File Selection] Reading file:", file.name);

      // Extract duration and resolution
      const meta = await getVideoMetadata(file);
      console.log("[Host Local File Selection] Extracted metadata:", meta);

      // Calculate checksum in browser
      let checksum = "";
      try {
        checksum = await computeSHA256(file);
        console.log("[Host Local File Selection] Generated Checksum:", checksum);
      } catch (err) {
        console.warn("Checksum calculation failed on host", err);
      }

      // Create video object in database with source: 'local'
      const payload = {
        title: file.name,
        fileName: file.name,
        size: file.size,
        duration: meta.duration || 180.0,
        resolution: meta.resolution,
        checksum: checksum || null
      };

      const localVideo = await api.createLocalVideoMetadata(payload);
      console.log("[Host Local File Selection] Registered local video metadata on server:", localVideo);

      // Change video for the room to this localVideo ID and send CHANGE_VIDEO broadcast
      await api.changeVideo(roomCode, localVideo.id);
      socketClientRef.current?.sendPlaybackSync('CHANGE_VIDEO', 0, localVideo.id);

      // Set host's local video state directly as 'correct' and bypass verification checks
      const objUrl = URL.createObjectURL(file);
      localVideoObjectUrlRef.current = objUrl;
      setLocalVideoUrl(objUrl);

      setVerificationDetails({
        nameMatch: true,
        sizeMatch: true,
        durationMatch: true,
        checksumMatch: checksum ? true : null,
        fileName: file.name,
        fileSize: file.size,
        fileDuration: meta.duration,
        fileMimeType: file.type || "video/mp4",
        fileChecksum: checksum
      });
      setVerificationStatus('correct');
      setSelectedFileName(file.name);

      // Send viewer ready status to unlock start playback
      socketClientRef.current?.sendViewerReady(10.0);

      // Close modal and reset view
      setShowVideoModal(false);
      setVideoModalView('options');
      loadRoomInfo();
    } catch (err: any) {
      console.error("[Host Local File Selection] Error processing host local file:", err);
      alert("Failed to parse local video metadata. Please verify the file is a valid video file.");
    } finally {
      setIsProcessingHostFile(false);
      if (hostLocalFileInputRef.current) {
        hostLocalFileInputRef.current.value = "";
      }
    }
  };

  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("[Verification Debug] File selection cancelled or no file selected.");
      return;
    }
    const vid = room?.currentVideo;
    if (!vid) {
      console.warn("[Verification Debug] Cannot select file: No current room video metadata found.");
      return;
    }

    console.log("[Verification Debug] =========================================");
    console.log("[Verification Debug] LOCAL MOVIE SELECTION TRIGGERED");
    console.log("[Verification Debug] =========================================");
    console.log("[Verification Debug] Selected file object:", file);
    console.log("[Verification Debug] File name:", file.name);
    console.log("[Verification Debug] File size (bytes):", file.size);
    console.log("[Verification Debug] MIME type:", file.type);
    console.log("[Verification Debug] Expected Movie title:", vid.title);
    console.log("[Verification Debug] Expected size:", vid.size);
    console.log("[Verification Debug] Expected duration:", vid.duration);

    setIsVerifying(true);
    setVerificationStatus('verifying');
    setSelectedFileName(file.name);

    if (localVideoObjectUrlRef.current) {
      URL.revokeObjectURL(localVideoObjectUrlRef.current);
      localVideoObjectUrlRef.current = null;
    }
    setLocalVideoUrl(null);

    // Bypass verification for Admin/Host
    if (isAdmin) {
      console.log("[Admin Local File Selection] Skipping verification checks for Admin. Directly selecting video.");
      const objUrl = URL.createObjectURL(file);
      localVideoObjectUrlRef.current = objUrl;
      setLocalVideoUrl(objUrl);

      setVerificationDetails({
        nameMatch: true,
        sizeMatch: true,
        durationMatch: true,
        checksumMatch: true,
        fileName: file.name,
        fileSize: file.size,
        fileDuration: vid.duration || 0,
        fileMimeType: file.type || "video/mp4",
        fileChecksum: vid.checksum || "",
      });

      setVerificationStatus('correct');
      socketClientRef.current?.sendViewerReady(10.0);
      setIsVerifying(false);
      if (videoFileInputRef.current) {
        videoFileInputRef.current.value = '';
      }
      return;
    }

    try {
      // 1. Name Match: case-insensitive, extension-stripped, robust space/underscore handling
      const cleanString = (str: string) => str.replace(/\.[^.]+$/, '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
      const cleanFile = cleanString(file.name);
      const cleanExpected = cleanString(vid.title || '');
      const nameMatch = cleanFile === cleanExpected || cleanFile.includes(cleanExpected) || cleanExpected.includes(cleanFile);

      // 2. Size Match: matches or within 1% tolerance
      const sizeDiff = Math.abs(file.size - (vid.size || 0));
      const sizeTolerance = (vid.size || 0) * 0.01;
      const sizeMatch = (vid.size && vid.size > 0) ? (sizeDiff <= sizeTolerance) : true;

      // 3. Duration Match: matches within ±2 seconds
      const fileDuration = await getVideoDuration(file);
      console.log("[Verification Debug] Extracted duration (seconds):", fileDuration);
      
      const durationDiff = Math.abs(fileDuration - (vid.duration || 0));
      const durationMatch = (vid.duration && vid.duration > 0) 
        ? (fileDuration > 0 && durationDiff <= 2) 
        : true;

      // 4. SHA-256 Checksum: preferred, calculated for files < 150MB to avoid freezing
      let fileChecksum = '';
      let checksumMatch: boolean | null = null;
      if (vid.checksum) {
        if (file.size < 150 * 1024 * 1024) {
          try {
            console.log("[Verification Debug] Calculating SHA-256 checksum...");
            fileChecksum = await computeSHA256(file);
            checksumMatch = fileChecksum === vid.checksum;
            console.log("[Verification Debug] Computed checksum:", fileChecksum);
          } catch (e) {
            console.warn("[Verification Debug] Checksum computation failed:", e);
          }
        } else {
          console.log("[Verification Debug] File size too large (>150MB). Skipping checksum calculation to prevent tab crash.");
        }
      }

      const details: VerificationDetails = {
        nameMatch,
        sizeMatch,
        durationMatch,
        checksumMatch,
        fileName: file.name,
        fileSize: file.size,
        fileDuration,
        fileMimeType: file.type,
        fileChecksum,
      };
      setVerificationDetails(details);

      // Verification decision: all three checks must pass for viewers
      // For Admin, we don't display errors or block them as requested
      const verified = isAdmin ? true : (nameMatch && sizeMatch && durationMatch && (checksumMatch !== false));

      console.log("[Verification Debug] Verification checks:", { nameMatch, sizeMatch, durationMatch, checksumMatch });
      console.log("[Verification Debug] Verification result:", verified);
      
      if (!verified) {
        console.log("[Verification Debug] Reason for failure:", {
          nameMismatch: !nameMatch ? `Clean selected name "${cleanFile}" did not match expected "${cleanExpected}"` : null,
          sizeMismatch: !sizeMatch ? `Selected size ${file.size} B is outside 1% tolerance of expected ${vid.size} B` : null,
          durationMismatch: !durationMatch ? `Selected duration ${fileDuration}s is outside 2s tolerance of expected ${vid.duration}s` : null,
          checksumMismatch: checksumMatch === false ? `SHA-256 checksum mismatch` : null
        });
      }

      if (verified) {
        const objUrl = URL.createObjectURL(file);
        localVideoObjectUrlRef.current = objUrl;
        setLocalVideoUrl(objUrl);
        setVerificationStatus('correct');
        socketClientRef.current?.sendViewerReady(10.0);
      } else {
        setVerificationStatus('wrong');
        socketClientRef.current?.sendViewerReady(0.0);
      }
    } catch (err) {
      console.error('[Verification Debug] Error in verification workflow:', err);
      setVerificationStatus('wrong');
      setVerificationDetails(null);
      socketClientRef.current?.sendViewerReady(0.0);
    } finally {
      setIsVerifying(false);
      if (videoFileInputRef.current) {
        videoFileInputRef.current.value = '';
      }
    }
  };

  const emojis = ['😀', '😂', '🔥', '🎉', '🍿', '👍', '❤️', '😮', '😮\u200d💨', '👏'];

  // ── Render video area ──────────────────────────────────────────────────────
  const renderVideoArea = () => {
    const vid = room?.currentVideo;

    // ── Phase 0: No movie selected by host yet ──────────────────────────────
    if (!vid) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(9,13,22,0.98) 0%, rgba(15,20,35,0.95) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)'
          }}
        >
          {/* Ambient glow strip */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(59,130,246,0.5), transparent)' }} />

          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            {/* Animated icon cluster */}
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(99,102,241,0.08)', animationDuration: '3s' }} />
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(59,130,246,0.1))', border: '1px solid rgba(99,102,241,0.25)' }}>
                <Clapperboard className="w-10 h-10" style={{ color: 'rgba(148,163,184,0.6)' }} />
              </div>
            </div>

            <h3 className="text-xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
              {isAdmin ? 'Choose a Movie to Broadcast' : 'No Movie Selected Yet'}
            </h3>
            <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'rgba(148,163,184,0.65)' }}>
              {isAdmin
                ? 'Select a movie from your Google Drive library. Once selected, all participants will be notified and can download their local copy.'
                : 'The host has not selected a movie yet. You will be notified as soon as the host picks one.'}
            </p>

            {isAdmin && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowVideoModal(true)}
                className="mt-8 flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-sm text-white"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #3b82f6)',
                  boxShadow: '0 8px 32px rgba(79,70,229,0.4)'
                }}
              >
                <Film className="w-5 h-5" />
                Browse Library
              </motion.button>
            )}

            {!isAdmin && (
              <div className="mt-8 flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-xs font-semibold" style={{ color: 'rgba(147,197,253,0.85)' }}>Waiting for host to select a movie…</span>
              </div>
            )}
          </div>
        </motion.div>
      );
    }

    // ── Phase 1+: Movie selected — full workflow card ───────────────────────
    return (
      <div className="space-y-5">

        {/* ── Video Player (shown only after successful verification) ── */}
        <AnimatePresence>
          {verificationStatus === 'correct' && localVideoUrl && (
            <motion.div
              key="player"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.35 }}
            >
              <VideoPlayer
                videoUrl={localVideoUrl}
                isAdmin={isAdmin}
                videoSource={
                  vid?.source === 'local' ? 'local'
                  : vid?.source === 'drive' ? 'drive'
                  : 'remote'
                }
                isPlayDisabled={isAdmin ? (viewerReadyStatus ? !viewerReadyStatus.allReady : true) : true}
                onPlaybackChange={handlePlaybackChange}
                syncState={syncState}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Placeholder screen while not yet verified ── */}
        <AnimatePresence>
          {verificationStatus !== 'correct' && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full rounded-3xl overflow-hidden relative"
              style={{ aspectRatio: '16/9', background: '#030508', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {/* Subtle film-grain texture overlay */}
              <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.05) 0%, transparent 40%)' }} />

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                  {verificationStatus === 'verifying' && (
                    <motion.div key="verifying" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(99,102,241,0.15)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite' }} />
                        <div className="absolute inset-3 rounded-full" style={{ border: '2px solid rgba(59,130,246,0.15)', borderTopColor: '#3b82f6', animation: 'spin 1.5s linear infinite reverse' }} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShieldCheck className="w-7 h-7" style={{ color: 'rgba(99,102,241,0.7)' }} />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-white text-sm">Verifying File…</p>
                        <p className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.6)' }}>Computing SHA-256 checksum for {selectedFileName || 'your file'}</p>
                      </div>
                    </motion.div>
                  )}
                  {verificationStatus === 'wrong' && (
                    <motion.div key="wrong" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 max-w-xs text-center">
                      <motion.div
                        initial={{ rotate: -10 }}
                        animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="w-20 h-20 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
                      >
                        <ShieldX className="w-9 h-9 text-red-400" />
                      </motion.div>
                      <div>
                        <p className="font-bold text-red-300 text-sm">Incorrect Movie</p>
                        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>The selected file does not match the movie chosen by the host. Please select the correct downloaded movie.</p>
                      </div>
                    </motion.div>
                  )}
                  {verificationStatus === 'unselected' && (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 text-center max-w-xs">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Film className="w-9 h-9" style={{ color: 'rgba(100,116,139,0.7)' }} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-400 text-sm">Awaiting Local File</p>
                        <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.7)' }}>Download the movie below, then click "Select Local Movie" to begin.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Netflix-style Movie Metadata + Action Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(9,13,22,0.98) 0%, rgba(15,20,35,0.95) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
          }}
        >
          {/* Top accent line */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(59,130,246,0.6), transparent)' }} />

          <div className="p-6 space-y-6">
            {/* Movie info row */}
            <div className="flex items-start gap-4">
              {/* Poster placeholder */}
              <div className="shrink-0 w-14 h-20 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(59,130,246,0.1))', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Film className="w-6 h-6" style={{ color: 'rgba(99,102,241,0.7)' }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {vid.source === 'drive' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: 'rgba(165,180,252,0.9)', border: '1px solid rgba(99,102,241,0.25)' }}>Google Drive</span>
                  )}
                  {vid.source === 'local' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: 'rgba(147,197,253,0.9)', border: '1px solid rgba(59,130,246,0.25)' }}>Local Movie (Host Computer)</span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white truncate" style={{ letterSpacing: '-0.01em' }}>{vid.title}</h3>
                {vid.description && <p className="text-xs mt-1 truncate" style={{ color: 'rgba(148,163,184,0.65)' }}>{vid.description}</p>}

                {/* Metadata pills */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {vid.duration > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(30,41,59,0.8)', color: 'rgba(148,163,184,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Clock className="w-3 h-3" />
                      {formatDuration(vid.duration)}
                    </span>
                  )}
                  {vid.size > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(30,41,59,0.8)', color: 'rgba(148,163,184,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Download className="w-3 h-3" />
                      {formatBytes(vid.size)}
                    </span>
                  )}
                  {vid.resolution && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(30,41,59,0.8)', color: 'rgba(148,163,184,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Monitor className="w-3 h-3 text-purple-400" />
                      {vid.resolution}
                    </span>
                  )}
                  {vid.checksum && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(30,41,59,0.8)', color: 'rgba(148,163,184,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      SHA-256 Verified
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Step instructions */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="mt-0.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: 'rgba(59,130,246,0.6)' }}>i</div>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(147,197,253,0.75)' }}>
                {vid.source !== 'local' ? (
                  <>
                    <span className="font-bold" style={{ color: 'rgba(147,197,253,0.95)' }}>Step 1:</span> Click <span className="font-bold" style={{ color: 'rgba(147,197,253,0.95)' }}>Download Movie</span> — your browser will save it natively.&nbsp;
                    <span className="font-bold" style={{ color: 'rgba(147,197,253,0.95)' }}>Step 2:</span> Click <span className="font-bold" style={{ color: 'rgba(147,197,253,0.95)' }}>Select Local Movie</span> to pick the file for verification.
                  </>
                ) : (
                  <>
                    This video is loaded locally from the Host's computer. Click <span className="font-bold" style={{ color: 'rgba(147,197,253,0.95)' }}>Select Local Movie</span> to pick your local copy of the same video file for verification.
                  </>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Download — primary (only if download link is available) */}
              {vid.source !== 'local' && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownloadVideo}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-sm text-white"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                    boxShadow: '0 8px 32px rgba(79,70,229,0.35)'
                  }}
                >
                  <Download className="w-5 h-5" />
                  Download Movie
                </motion.button>
              )}

              {/* Select Local — secondary */}
              <motion.button
                whileHover={{ scale: isVerifying ? 1 : 1.02 }}
                whileTap={{ scale: isVerifying ? 1 : 0.97 }}
                onClick={() => videoFileInputRef.current?.click()}
                disabled={isVerifying}
                className="flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-sm"
                style={{
                  background: 'rgba(15,23,42,0.8)',
                  border: `1px solid ${isVerifying ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: isVerifying ? 'rgba(148,163,184,0.7)' : 'rgba(226,232,240,0.9)',
                  cursor: isVerifying ? 'not-allowed' : 'pointer'
                }}
              >
                {isVerifying
                  ? <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#6366f1' }} />
                  : <FolderOpen className="w-5 h-5" style={{ color: '#fbbf24' }} />
                }
                {isVerifying ? 'Verifying…' : 'Select Local Movie'}
              </motion.button>

              <input
                type="file"
                ref={videoFileInputRef}
                onChange={handleLocalFileSelect}
                accept="video/mp4,video/x-matroska,.mkv,video/avi,.avi,video/quicktime,video/webm,.mp4,.mkv,.avi,.mov,.webm"
                className="hidden"
              />
            </div>

            {/* Selected file badge */}
            <AnimatePresence>
              {selectedFileName && (
                <motion.div
                  key="filebadge"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
                  <span className="text-[11px] font-mono truncate" style={{ color: 'rgba(148,163,184,0.8)' }}>{selectedFileName}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Verification Result Banner */}
            <AnimatePresence>
              {verificationStatus !== 'unselected' && verificationDetails && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    border: verificationStatus === 'correct' ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    background: verificationStatus === 'correct' ? 'rgba(6,78,59,0.2)' : 'rgba(127,29,29,0.15)'
                  }}
                >
                  {/* Result header */}
                  <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: verificationStatus === 'correct' ? '1px solid rgba(52,211,153,0.12)' : '1px solid rgba(239,68,68,0.12)' }}>
                    {verificationStatus === 'correct' ? (
                      <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
                        <ShieldCheck className="w-6 h-6 text-emerald-400" />
                      </motion.div>
                    ) : (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
                        <ShieldX className="w-6 h-6 text-red-400" />
                      </motion.div>
                    )}
                    <div>
                      <p className={`text-sm font-bold ${verificationStatus === 'correct' ? 'text-emerald-300' : 'text-red-300'}`}>
                        {verificationStatus === 'correct' ? '✅ Correct Movie Selected' : '❌ Wrong Movie Selected'}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: verificationStatus === 'correct' ? 'rgba(110,231,183,0.6)' : 'rgba(252,165,165,0.6)' }}>
                        {verificationStatus === 'correct' ? 'Verification passed — Ready for Playback' : 'Please select the correct downloaded movie.'}
                      </p>
                    </div>
                  </div>

                  {/* Failure reason block */}
                  {verificationStatus === 'wrong' && (
                    <div className="px-5 py-3 space-y-2 bg-red-950/20 border-t border-red-500/10">
                      <p className="text-[11px] font-bold text-red-400">Failed Verification Checks:</p>
                      <ul className="text-[10px] space-y-1 list-disc pl-4 text-slate-350">
                        {!verificationDetails.nameMatch && (
                          <li>
                            <span className="text-red-350 font-semibold">Wrong file name</span>: The name does not match expected movie "{room?.currentVideo?.title}"
                          </li>
                        )}
                        {!verificationDetails.sizeMatch && (
                          <li>
                            <span className="text-red-350 font-semibold">Wrong file size</span>: Expected size within 1% of expected {formatBytes(room?.currentVideo?.size || 0)} ({room?.currentVideo?.size || 0} bytes)
                          </li>
                        )}
                        {!verificationDetails.durationMatch && (
                          <li>
                            <span className="text-red-350 font-semibold">Wrong duration</span>: Expected duration within ±2s of expected {formatDuration(room?.currentVideo?.duration || 0)} ({room?.currentVideo?.duration || 0}s)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Verification detail grid */}
                  <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {[
                      { label: 'File Name', value: verificationDetails.fileName, match: verificationDetails.nameMatch },
                      { label: 'File Size', value: `${formatBytes(verificationDetails.fileSize)} (${verificationDetails.fileSize} bytes)`, match: verificationDetails.sizeMatch },
                      { label: 'Duration', value: `${formatDuration(verificationDetails.fileDuration)} (${Math.round(verificationDetails.fileDuration)}s)`, match: verificationDetails.durationMatch },
                      { label: 'MIME Type', value: verificationDetails.fileMimeType || 'video/unknown', match: true },
                      ...(verificationDetails.fileChecksum ? [{ label: 'SHA-256', value: `${verificationDetails.fileChecksum.slice(0,8)}…${verificationDetails.fileChecksum.slice(-8)}`, match: verificationDetails.checksumMatch }] : []),
                    ].map(({ label, value, match }) => (
                      <div key={label} className="px-4 py-3" style={{ background: 'rgba(9,13,22,0.4)' }}>
                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(100,116,139,0.8)' }}>{label}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono truncate" style={{ color: match === true ? 'rgba(110,231,183,0.9)' : match === false ? 'rgba(252,165,165,0.9)' : 'rgba(148,163,184,0.7)' }}>{value}</span>
                          {match === true && <span className="text-emerald-400 text-xs shrink-0">✓</span>}
                          {match === false && <span className="text-red-400 text-xs shrink-0">✗</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Readiness Panel ── */}
        <AnimatePresence>
          {vid && (isWaitingForViewers || viewerReadyStatus) && (
            <motion.div
              key="readiness"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-5 rounded-3xl"
              style={{
                background: viewerReadyStatus?.allReady
                  ? 'linear-gradient(135deg, rgba(6,78,59,0.25), rgba(5,46,22,0.2))'
                  : 'linear-gradient(135deg, rgba(9,13,22,0.9), rgba(15,20,40,0.8))',
                border: viewerReadyStatus?.allReady ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(59,130,246,0.15)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  {viewerReadyStatus?.allReady
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <Clock className="w-4 h-4 text-blue-400" style={{ animation: 'spin 3s linear infinite' }} />
                  }
                  <span className="text-xs font-bold" style={{ color: viewerReadyStatus?.allReady ? 'rgba(110,231,183,0.9)' : 'rgba(226,232,240,0.8)' }}>
                    {viewerReadyStatus?.allReady
                      ? 'All participants ready — Host can play!'
                      : 'Waiting for participants to verify their local file…'}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-xl" style={{
                  background: viewerReadyStatus?.allReady ? 'rgba(52,211,153,0.15)' : 'rgba(59,130,246,0.1)',
                  color: viewerReadyStatus?.allReady ? 'rgba(110,231,183,0.9)' : 'rgba(147,197,253,0.8)',
                  border: viewerReadyStatus?.allReady ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(59,130,246,0.2)'
                }}>
                  {viewerReadyStatus ? `${viewerReadyStatus.readyViewers} / ${viewerReadyStatus.totalViewers} Ready` : '0 / 0 Ready'}
                </span>
              </div>

              {viewerReadyStatus && viewerReadyStatus.viewers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {viewerReadyStatus.viewers.map((v) => (
                    <div
                      key={v.username}
                      className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-xl"
                      style={{
                        background: v.isReady ? 'rgba(6,78,59,0.3)' : 'rgba(30,41,59,0.6)',
                        border: v.isReady ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        color: v.isReady ? 'rgba(110,231,183,0.9)' : 'rgba(148,163,184,0.7)'
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: v.isReady ? '#34d399' : '#fbbf24', animation: v.isReady ? 'none' : 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                      <span className="font-semibold">{v.username}</span>
                      <span className="opacity-60">
                        {v.isReady
                          ? (v.username === room?.creator?.username ? '✅ Host Ready' : '✅ Ready')
                          : '⏳ Selecting…'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 bg-slate-950/80 border-b border-slate-900/60 backdrop-blur-md flex justify-between items-center z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg flex items-center justify-center">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-none">
              {room ? room.name : 'SyncStream Watchroom'}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-semibold bg-slate-900 px-2 py-0.5 border border-slate-800 rounded-sm font-mono text-slate-350">
                CODE: {roomCode}
              </span>
              <button onClick={copyRoomCode} className="p-1 hover:bg-slate-900 text-slate-400 hover:text-white rounded-md transition-all" title="Copy Room Code">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowVideoModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-600/10 flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Select Video
            </button>
          )}
          <button
            onClick={handleExitRoom}
            className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-red-500/20 hover:bg-red-500/5 text-slate-400 hover:text-red-400 rounded-xl transition-all font-medium text-xs flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            {isAdmin ? 'End Session' : 'Exit Room'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Video + Location */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
          {renderVideoArea()}

          {/* Location Panel */}
          <div className="glass-panel p-5 rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-pink-500" />
                  Live Location Sharing (Updates every 10s)
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Required to map connected watchers. Choose between sharing your actual browser GPS or selecting a simulated mock location.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setUseMockLocation(!useMockLocation)}
                  className={`text-xs px-3 py-1.5 border rounded-lg font-semibold transition-all ${
                    useMockLocation ? 'bg-purple-600/10 border-purple-500 text-purple-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {useMockLocation ? 'Mock Location: Enabled' : 'GPS Active'}
                </button>
                {useMockLocation && (
                  <select
                    value={selectedMockIndex}
                    onChange={(e) => setSelectedMockIndex(parseInt(e.target.value))}
                    className="bg-slate-900 border border-slate-800 text-xs px-2 py-1.5 rounded-lg text-white font-semibold focus:outline-none"
                  >
                    {MOCK_LOCATIONS.map((loc, idx) => (
                      <option key={idx} value={idx}>{loc.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Tabbed Sidebar */}
        <div className="w-full lg:w-96 bg-slate-950/80 border-t lg:border-t-0 lg:border-l border-slate-900/60 flex flex-col h-[500px] lg:h-auto">
          <div className="flex border-b border-slate-900/60 p-2 gap-1 bg-slate-950">
            {(['chat', 'map', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === tab ? 'bg-slate-900 border border-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'chat' && <><MessageSquare className="w-4 h-4" /> Chat</>}
                {tab === 'map' && <><MapPin className="w-4 h-4" /> Viewers Map</>}
                {tab === 'analytics' && <><BarChart2 className="w-4 h-4" /> Stats</>}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <AnimatePresence mode="wait">
              {activeTab === 'chat' && (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.map((msg, idx) => {
                      const isSystem = msg.type === 'JOIN' || msg.type === 'LEAVE';
                      const isSelf = msg.sender === username;
                      if (isSystem) {
                        return (
                          <div key={msg.id || idx} className="text-center">
                            <span className="text-[10px] font-semibold bg-slate-900/60 border border-slate-900 px-3 py-1 rounded-full text-slate-500 font-mono">{msg.content}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id || idx} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                          <span className="text-[10px] text-slate-500 font-semibold mb-1 px-1">{msg.sender}</span>
                          <div className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed ${isSelf ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-850 text-slate-200 rounded-tl-none'}`}>
                            {msg.type === 'IMAGE'
                              ? <img src={msg.content} alt="shared" className="rounded-lg max-h-48 object-cover border border-black/20" />
                              : <p className="whitespace-pre-wrap">{msg.content}</p>
                            }
                          </div>
                          <span className="text-[9px] text-slate-600 mt-1 px-1 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>

                  {Object.entries(typingUsers).some(([, typing]) => typing) && (
                    <div className="px-4 py-1 text-[10px] text-slate-500 italic bg-slate-950 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                      {Object.entries(typingUsers).filter(([, t]) => t).map(([u]) => u).join(', ')} is typing...
                    </div>
                  )}

                  <form onSubmit={handleSendChat} className="p-3 bg-slate-950 border-t border-slate-900 flex flex-col gap-2 relative">
                    {isEmojiOpen && (
                      <div className="absolute bottom-16 left-3 bg-slate-900 border border-slate-800 p-2.5 rounded-xl shadow-xl z-50 flex gap-2">
                        {emojis.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => handleEmojiClick(emoji)} className="hover:scale-125 transition-transform text-lg">{emoji}</button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl transition-all" title="Upload Image">
                        <Image className="w-4 h-4" />
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                      <button type="button" onClick={() => setIsEmojiOpen(!isEmojiOpen)} className="p-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl transition-all" title="Add Emoji">
                        <Smile className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={handleChatInputChange}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 bg-slate-900 border border-slate-850 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-all focus:outline-none"
                      />
                      <button type="submit" disabled={!chatInput.trim()} className="p-2 bg-blue-600 hover:bg-blue-505 disabled:bg-slate-900 text-white disabled:text-slate-500 rounded-xl transition-all">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {activeTab === 'map' && (
                <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden dark-map">
                  <MapContainer center={[20.0, 0.0]} zoom={1.5} scrollWheelZoom={true} className="w-full h-full">
                    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {Object.values(viewerLocations).map((loc: any) => (
                      <Marker key={loc.username} position={[loc.latitude, loc.longitude]} icon={createPulseIcon()}>
                        <Popup className="custom-popup">
                          <div className="p-1 font-sans text-slate-900">
                            <p className="font-bold text-xs">{loc.username}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Coords: {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</p>
                            <p className="text-[9px] text-slate-400 mt-1 italic">Last updated: {new Date(loc.lastUpdated).toLocaleTimeString()}</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </motion.div>
              )}

              {activeTab === 'analytics' && (
                <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto p-5 space-y-6">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-amber-500" />
                    Real-time Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Active Viewers', value: analytics.activeViewers, color: 'text-white' },
                      { label: 'Peak Viewers', value: analytics.peakUsers, color: 'text-white' },
                      { label: 'Avg Latency', value: `${analytics.averageLatency.toFixed(1)} ms`, color: 'text-blue-400' },
                      { label: 'Playback Status', value: analytics.playbackStatus, color: 'text-purple-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-4 bg-slate-900 border border-slate-850 rounded-2xl">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block tracking-wider">{label}</span>
                        <span className={`text-xl font-bold mt-1 block ${color}`}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-850 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      Audience Roster ({participants.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {participants.map((member) => (
                        <div key={member} className="flex justify-between items-center p-2 hover:bg-slate-850 rounded-lg transition-colors">
                          <span className="text-xs text-slate-300 font-semibold">{member}</span>
                          <div className="flex items-center gap-2">
                            {member === room?.creator?.username ? (
                              <span className="text-[9px] font-mono px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-sm">Creator/Host</span>
                            ) : (
                              isAdmin && (
                                <button onClick={() => handleKickUser(member)} className="text-[10px] px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-md transition-all">
                                  Kick
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Select Video Modal */}
      <AnimatePresence>
        {showVideoModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-950 border border-slate-900 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
              style={{
                boxShadow: '0 30px 70px rgba(0, 0, 0, 0.8)',
                background: 'linear-gradient(135deg, rgba(13,17,28,0.99) 0%, rgba(9,12,20,0.98) 100%)'
              }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-900/60 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white leading-none">
                    {videoModalView === 'options' ? 'Choose Video Source' : 'Dashboard Library'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {videoModalView === 'options' ? 'Select where you want to stream your media file from.' : 'Select a movie uploaded or imported from Google Drive.'}
                  </p>
                </div>
                {videoModalView === 'library' && (
                  <button 
                    onClick={() => setVideoModalView('options')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white transition-all bg-slate-900/40"
                  >
                    ← Back to Sources
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {videoModalView === 'options' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
                    {/* Option 1: Dashboard Library */}
                    <motion.div
                      whileHover={{ scale: 1.02, translateY: -4 }}
                      onClick={() => setVideoModalView('library')}
                      className="group cursor-pointer rounded-2xl p-5 flex flex-col justify-between transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-600/10 border border-indigo-500/20 group-hover:bg-indigo-600/20 transition-all">
                          <Clapperboard className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">📚 Dashboard Library</h4>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            Select a movie that has already been uploaded to SyncStream or imported from Google Drive.
                          </p>
                        </div>
                      </div>
                      <div className="mt-8">
                        <button className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/10 group-hover:scale-[1.01]">
                          Open Dashboard Library
                        </button>
                      </div>
                    </motion.div>

                    {/* Option 2: Browse Local Folder */}
                    <motion.div
                      whileHover={{ scale: 1.02, translateY: -4 }}
                      onClick={() => hostLocalFileInputRef.current?.click()}
                      className="group cursor-pointer rounded-2xl p-5 flex flex-col justify-between transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-600/10 border border-blue-500/20 group-hover:bg-blue-600/20 transition-all">
                          <Monitor className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">💻 Browse Local Folder</h4>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            Select a movie file stored on this computer to sync directly with viewers. No uploading required.
                          </p>
                        </div>
                      </div>
                      <div className="mt-8">
                        <button className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/10 group-hover:scale-[1.01]">
                          Browse Local Folder
                        </button>
                      </div>
                    </motion.div>

                    {/* Hidden inputs */}
                    <input
                      type="file"
                      ref={hostLocalFileInputRef}
                      onChange={handleHostLocalFileSelect}
                      accept="video/mp4,video/x-matroska,.mkv,video/avi,.avi,video/quicktime,video/webm,.mp4,.mkv,.avi,.mov,.webm"
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {videoLibrary.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">Your video library is empty. Please upload videos from the Dashboard.</p>
                    ) : (
                      videoLibrary.map((vid) => (
                        <div
                          key={vid.id}
                          onClick={() => handleSelectVideo(vid.id)}
                          className="p-3 bg-slate-950/60 border border-slate-900 hover:border-indigo-500 hover:bg-slate-900/20 rounded-2xl flex justify-between items-center cursor-pointer transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white">{vid.title}</h4>
                              {vid.source === 'drive' && (
                                <span className="shrink-0 text-[8px] font-semibold bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-1.5 py-0.5 rounded">Google Drive</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-450 mt-1 line-clamp-1">{vid.description}</p>
                            {vid.checksum && (
                              <p className="text-[9px] text-slate-600 mt-1 font-mono">SHA-256: {vid.checksum.slice(0, 16)}&hellip;</p>
                            )}
                          </div>
                          <span className="text-xs font-mono text-slate-500 shrink-0 ml-4">
                            {vid.size > 0 ? formatBytes(vid.size) : (vid.source === 'drive' ? 'Cloud' : `${vid.duration}s`)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-900/60 flex justify-between items-center bg-slate-950/20">
                <span className="text-[10px] text-slate-600 font-mono">
                  {isProcessingHostFile ? 'Processing local movie file...' : 'SyncStream Media Hub'}
                </span>
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-all"
                  disabled={isProcessingHostFile}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
