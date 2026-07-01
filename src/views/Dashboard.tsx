import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, LogOut, Plus, Search, Trash2, Video, Key, Calendar, HardDrive, UploadCloud, RefreshCw, AlertCircle } from 'lucide-react';
import { api, getRole, getUsername, clearAuthData } from '../services/api';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const username = getUsername();
  const role = getRole();
  const isAdmin = role === 'ROLE_ADMIN';

  // State
  const [rooms, setRooms] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  
  // Video upload state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Loading & Error states
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Google Drive state
  const [driveUrl, setDriveUrl] = useState('');
  const [importingDrive, setImportingDrive] = useState(false);

  // Fetch videos and active rooms
  const loadData = async () => {
    setLoadingVideos(true);
    try {
      const videoList = await api.getVideos(searchQuery);
      setVideos(videoList);
      
      const roomList = await api.getRooms();
      setRooms(roomList.filter((r: any) => r.active));
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch data from the server.');
    } finally {
      setLoadingVideos(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const handleLogout = () => {
    clearAuthData();
    navigate('/');
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setCreatingRoom(true);
    setError('');
    try {
      const room = await api.createRoom(newRoomName);
      navigate(`/room/${room.code}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomCode.trim()) return;

    setJoiningRoom(true);
    setError('');
    try {
      const room = await api.joinRoom(joinRoomCode.trim().toUpperCase());
      navigate(`/room/${room.code}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join room. Verify code.');
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle.trim()) {
      setError('Please provide a file and title');
      return;
    }

    setUploading(true);
    setError('');
    setSuccessMsg('');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle);
    formData.append('description', uploadDescription);

    try {
      await api.uploadVideo(formData);
      setSuccessMsg('Video uploaded successfully!');
      setUploadTitle('');
      setUploadDescription('');
      setUploadFile(null);
      // Reset input element
      const fileInput = document.getElementById('video-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      loadData();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this video?')) return;
    try {
      await api.deleteVideo(id);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete video');
    }
  };

  const handleImportDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;

    setImportingDrive(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.loadDriveFolder(driveUrl.trim());
      setSuccessMsg(`Successfully imported ${res.added} videos! Total folder videos: ${res.total}.`);
      setDriveUrl('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to import Google Drive folder. Make sure the folder is public and contains video files.');
    } finally {
      setImportingDrive(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 pb-12">
      {/* Navbar */}
      <nav className="px-6 py-4 bg-slate-950/70 border-b border-slate-900/60 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg flex items-center justify-center">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            SyncStream
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-white">{username}</p>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              {isAdmin ? 'Host/Admin' : 'Viewer'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850 rounded-xl transition-all"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column (Rooms / Controls) */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Action Card: Join or Create Room */}
          <div className="glass-panel p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-xl pointer-events-none" />
            
            {isAdmin ? (
              // ADMIN: Create Room
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-500" />
                  Create a Watch Room
                </h3>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Start a new synchronized streaming room. You will have full playback controls.
                </p>
                <div>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="E.g., Sunday Movie Night"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-sm text-white transition-all"
                    required
                    disabled={creatingRoom}
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingRoom}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  {creatingRoom ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create Room'}
                </button>
              </form>
            ) : (
              // VIEWER: Join Room
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-500" />
                  Join a Watch Room
                </h3>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Enter the 6-character room access code shared by the host to watch synchronized.
                </p>
                <div>
                  <input
                    type="text"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value)}
                    placeholder="Enter 6-char code (e.g., AB3D8E)"
                    maxLength={6}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-center font-mono font-bold tracking-widest text-sm text-white uppercase transition-all"
                    required
                    disabled={joiningRoom}
                  />
                </div>
                <button
                  type="submit"
                  disabled={joiningRoom}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  {joiningRoom ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Join Room'}
                </button>
              </form>
            )}
          </div>

          {/* Feedback & Error panel */}
          {(error || successMsg) && (
            <div className="space-y-4">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-red-300">{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-emerald-300">{successMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* Active Rooms Listing */}
          <div className="glass-panel p-6 rounded-2xl shadow-lg">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-500" />
              Active Rooms ({rooms.length})
            </h3>
            {rooms.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No active watch rooms found.</p>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    onClick={() => navigate(`/room/${room.code}`)}
                    className="p-3 bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:bg-slate-850"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-white">{room.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Code: {room.code}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium rounded-md">
                      Join
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column (Videos) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Video Library Section */}
          <div className="glass-panel p-6 rounded-2xl shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-500" />
                Video Library ({videos.length})
              </h3>
              
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full sm:w-64 pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-all"
                />
              </div>
            </div>

            {/* Video List */}
            {loadingVideos ? (
              <div className="space-y-4 py-8">
                <div className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
                <div className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Your video library is empty.</p>
                {isAdmin && <p className="text-[10px] text-slate-650">Upload a video below to get started.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {videos.map((vid) => (
                  <div
                    key={vid.id}
                    className="p-4 bg-slate-900/40 border border-slate-850/80 hover:border-slate-800 rounded-xl flex flex-col justify-between group transition-all"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                            {vid.title}
                          </h4>
                          {vid.source === 'drive' && (
                            <span className="shrink-0 text-[9px] font-semibold bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-1.5 py-0.5 rounded">
                              Google Drive
                            </span>
                          )}
                        </div>
                        
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteVideo(vid.id)}
                            className="text-slate-500 hover:text-red-400 p-1 hover:bg-slate-800 rounded-md transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Video"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-450 mt-1 line-clamp-2 leading-relaxed">
                        {vid.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900/60 mt-4 pt-3 text-[10px] text-slate-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-600" />
                        <span>{new Date(vid.uploadDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                          <span>{vid.source === 'drive' ? 'Cloud Stream' : formatBytes(vid.size)}</span>
                        </div>
                        <span className="px-1.5 py-0.5 bg-slate-800 border border-slate-750 text-slate-350 rounded-sm">
                          {vid.contentType ? vid.contentType.split('/')[1].toUpperCase() : 'MP4'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ADMIN: Upload & Import Control Panel */}
          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Upload Card */}
              <div className="glass-panel p-6 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-blue-500" />
                    Upload New Video
                  </h3>
                  
                  <form onSubmit={handleUploadVideo} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider block">
                          Video Title
                        </label>
                        <input
                          type="text"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="Enter clear title"
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs text-white placeholder-slate-600 transition-all"
                          required
                          disabled={uploading}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider block">
                          Description
                        </label>
                        <input
                          type="text"
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          placeholder="Brief description of the media"
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs text-white placeholder-slate-600 transition-all"
                          disabled={uploading}
                        />
                      </div>
                    </div>

                    {/* File Dropzone */}
                    <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-blue-500/50 transition-all relative">
                      <input
                        type="file"
                        id="video-file-input"
                        accept="video/mp4,video/webm"
                        onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={uploading}
                        required
                      />
                      <div className="flex flex-col items-center gap-2">
                        <UploadCloud className="w-8 h-8 text-slate-500 animate-bounce" />
                        <p className="text-xs text-slate-400 font-medium">
                          {uploadFile ? uploadFile.name : 'Drag & drop or click to browse'}
                        </p>
                        <p className="text-[10px] text-slate-600">Supports MP4, WEBM (Max 500MB)</p>
                      </div>
                    </div>

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={uploading || !uploadFile}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/40 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/10"
                    >
                      {uploading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Uploading & Processing Video (Do not close)...
                        </>
                      ) : (
                        'Upload Media File'
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Import Google Drive Folder Card */}
              <div className="glass-panel p-6 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-indigo-500" />
                    Import Google Drive Folder
                  </h3>
                  <p className="text-xs text-slate-455 leading-relaxed mb-4">
                    Paste a public Google Drive folder link. Any video files (MP4, MKV, AVI, etc.) inside will be imported and synchronized.
                  </p>
                  
                  <form onSubmit={handleImportDriveFolder} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider block">
                        Google Drive Folder URL
                      </label>
                      <input
                        type="url"
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs text-white placeholder-slate-600 transition-all"
                        required
                        disabled={importingDrive}
                      />
                    </div>

                    <div className="p-4 bg-blue-950/20 border border-blue-900/30 rounded-xl text-[11px] text-slate-400 space-y-1">
                      <p className="font-semibold text-blue-400">Requirements:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>Folder access must be "Anyone with the link can view".</li>
                        <li>Videos must be compatible HTML5 video formats.</li>
                      </ul>
                    </div>

                    <button
                      type="submit"
                      disabled={importingDrive || !driveUrl.trim()}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/10"
                    >
                      {importingDrive ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Importing Folder Content...
                        </>
                      ) : (
                        'Import Drive Videos'
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};
