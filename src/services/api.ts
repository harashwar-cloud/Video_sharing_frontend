const API_BASE_URL = `${import.meta.env.VITE_API_URL}/api`;

// Retrieve token helper
export const getToken = () => localStorage.getItem('token');
export const getUsername = () => localStorage.getItem('username');
export const getRole = () => localStorage.getItem('role');

// Set auth helper
export const setAuthData = (token: string, username: string, role: string) => {
  localStorage.setItem('token', token);
  localStorage.setItem('username', username);
  localStorage.setItem('role', role);
};

// Clear auth helper
export const clearAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
};

// Custom fetch client with JWT inclusion
const request = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set Content-Type only if it's not FormData (which sets its own boundary)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = 'Something went wrong';
    try {
      const err = await response.json();
      errorMsg = err.message || errorMsg;
    } catch {
      try {
        errorMsg = await response.text() || errorMsg;
      } catch {}
    }
    throw new Error(errorMsg);
  }

  // Return text if body is empty, otherwise JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

export const api = {
  // Auth
  login: (body: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  // Videos
  getVideos: (search?: string) => request(`/videos${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getVideo: (id: number) => request(`/videos/${id}`),
  deleteVideo: (id: number) => request(`/videos/${id}`, { method: 'DELETE' }),
  uploadVideo: (formData: FormData) => request('/videos/upload', {
    method: 'POST',
    body: formData,
  }),

  // Rooms
  createRoom: (name: string) => request('/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  getRooms: () => request('/rooms'),
  joinRoom: (code: string) => request(`/rooms/join/${code}`, { method: 'POST' }),
  getRoomDetails: (code: string) => request(`/rooms/${code}`),
  getParticipants: (code: string) => request(`/rooms/${code}/participants`),
  getAnalytics: (code: string) => request(`/rooms/${code}/analytics`),
  changeVideo: (code: string, videoId: number) => request(`/rooms/${code}/change-video/${videoId}`, { method: 'POST' }),
  endSession: (code: string) => request(`/rooms/${code}`, { method: 'DELETE' }),
  getChatHistory: (code: string) => request(`/rooms/${code}/chat-history`),

  // Google Drive
  loadDriveFolder: (folderUrl: string) => request('/drive/folder', {
    method: 'POST',
    body: JSON.stringify({ folderUrl }),
  }),

  // Drive Cache
  getCacheStatus:     (fileId: string) => request(`/drive/cache/${fileId}`),
  listCache:          ()               => request('/drive/cache'),
  evictCache:         (fileId: string) => request(`/drive/cache/${fileId}`, { method: 'DELETE' }),

  // Viewer readiness
  getViewerReadiness: (code: string)   => request(`/rooms/${code}/viewer-readiness`),

  // Local Video Metadata
  createLocalVideoMetadata: (body: any) => request('/videos/local-metadata', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};

