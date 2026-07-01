# SyncStream Frontend — React watch-party App

This is the client-side Single Page Application (SPA) for SyncStream built with React, TypeScript, Vite, Tailwind CSS, Framer Motion, and Leaflet Maps.

---

## 1. Development Setup

### Prerequisites
Ensure you have Node.js (version 20+ recommended) installed.

### Environment Configuration
Create a `.env` file in this directory (a default `.env` is already configured for localhost development):
```env
VITE_API_URL=http://localhost:8080
```

### Installation & Run
1. Install project dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
The client app will open locally at [http://localhost:5173](http://localhost:5173).

---

## 2. Deployment on Vercel or Netlify

The frontend is fully static and can be deployed directly from GitHub to static hosting platforms like Vercel or Netlify.

### Configuration Steps
1. Create a new project on Vercel or Netlify and connect your frontend repository.
2. Select **Vite** as the framework preset (or choose "Other").
3. Set the following build settings:
   - **Build Command**: `npm run build` (or `tsc -b && vite build`)
   - **Output Directory**: `dist`
4. Add the following **Environment Variable**:
   - `VITE_API_URL`: The URL of your deployed backend service (e.g. `https://syncstream-backend.onrender.com`).
5. Trigger a deployment.
