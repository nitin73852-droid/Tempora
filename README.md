# Tempora

A modern temporary workspace-based chat platform where conversations automatically disappear when the workspace ends.

---

## 🌟 Overview

**Tempora** is a private, real-time, room-based communication application designed for temporary collaboration. Built with server-authoritative monotonic sequence synchronization, server-side AES-256-GCM encryption at rest, and local IndexedDB persistence, Tempora ensures fast, reliable messaging while leaving zero permanent chat history behind.

---

## 📸 Screenshots

| Dashboard & Onboarding | Active Chat Workspace | Mobile View |
| :---: | :---: | :---: |
| ![Home Screenshot](screenshots/home.png) | ![Chat Workspace](screenshots/chat.png) | ![Mobile View](screenshots/mobile.png) |

---

## ✨ Features

- ⏳ **Temporary Workspaces**: Rooms automatically expire after configured durations (30 min, 1 hour, 24 hours, 7 days, or custom/manual).
- ⚡ **Real-Time Communication**: Instant messaging powered by WebSockets (Socket.IO) with server-authoritative monotonic sequence ordering.
- 📦 **Offline Message Delivery**: Recipient-specific pending queue delivers messages reliably when offline members rejoin.
- 📁 **Temporary File Sharing**: Upload and share files (up to 15 MB) encrypted at rest with automatic destruction on room expiry.
- 👤 **Mandatory Nickname Onboarding**: Seamless, non-intrusive identity onboarding for new visitors.
- 😀 **Emoji Reactions & Swipe to Reply**: Rich messaging interactions including quick reaction popups and swipe-to-reply gestures.
- 🔒 **Host Moderation Controls**: Room hosts can lock/unlock group joins and kick members in real time.
- 🛡️ **Server-Side Rest Encryption**: All stored message payloads and temporary files are transparently encrypted with AES-256-GCM.
- 📱 **Fully Responsive UI**: Modern dark-mode UI optimized for desktop, tablet, and mobile browsers.
- 💾 **Local-First IndexedDB Caching**: Fast local UI renders with offline persistence for active room members.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Vanilla CSS3 + TailwindCSS
- **State Management**: Zustand
- **Local Persistence**: IndexedDB (idb)
- **Real-Time**: Socket.IO Client
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js & Express
- **Real-Time Engine**: Socket.IO Server
- **Database**: Turso SQLite (LibSQL)
- **Encryption**: In-Memory AES-256-GCM
- **File Handling**: Multer

### Deployment & Infrastructure
- **Backend Hosting**: Railway
- **Frontend Hosting**: Netlify

---

## 🏗️ Architecture

```
                       ┌─────────────────────────┐
                       │  Netlify Web Client     │
                       │ (React + IndexedDB)     │
                       └───────────┬─────────────┘
                                   │
                           WebSocket (Socket.IO)
                           REST API (File Uploads)
                                   │
                                   ▼
                       ┌─────────────────────────┐
                       │  Railway Node.js API    │
                       │  (Monotonic Sequence)   │
                       └───────────┬─────────────┘
                                   │
                        AES-256-GCM Encryption
                                   │
                                   ▼
                       ┌─────────────────────────┐
                       │   Turso Cloud SQLite    │
                       │ (Pending Message Queue) │
                       └─────────────────────────┘
```

1. **Message Lifecycle**:
   - Clients transmit events over WebSockets with a unique `clientMsgId`.
   - The backend allocates a room-specific monotonic sequence number atomically using single-query `RETURNING` statements.
   - Messages are delivered immediately to online members via Socket.IO room broadcast.

2. **Offline Delivery & Pending Queue**:
   - Recipient-specific rows are created in `pending_messages` for offline members.
   - When an offline member connects, `auth_and_join` flushes all pending payloads in exact sequence order and deletes them from the server.

3. **Room Expiry & Data Cleanup**:
   - Background tasks and real-time triggers purge rooms, pending rows, file records, and physical files as soon as room expiry times are reached.

---

## 🔒 Security

- **Encryption at Rest**: Message text and file buffers are encrypted using **AES-256-GCM** before writing to Turso SQLite.
- **Environment Isolation**: Secrets (database tokens, JWT secrets, encryption keys) exist purely in environment variables. Zero credentials committed.
- **Ephemeral Storage**: Server holds no permanent chat logs. Delivered messages are immediately removed from pending queues.
- **Secure Transport**: All production traffic uses HTTPS and WSS protocols.

---

## 🚀 Local Installation & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Clone Repository
```bash
git clone https://github.com/nitin73852-droid/Tempora.git
cd Tempora
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory (refer to `.env.example`):
```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
TURSO_DATABASE_URL=libsql://your-turso-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
CHAT_ENCRYPTION_KEY=32_character_master_encryption_key
JWT_SECRET=your_jwt_secret_key
```

Start backend development server:
```bash
npm run dev
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_API_URL=http://localhost:3001
```

Start frontend development server:
```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🌐 Production Deployment

### Backend Deployment (Railway)
1. Create a new service on [Railway](https://railway.app) from the GitHub repository `Tempora` (root folder: `/backend`).
2. Add environment variables:
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `https://tempora-v2.netlify.app`
   - `TURSO_DATABASE_URL` = `<your-turso-url>`
   - `TURSO_AUTH_TOKEN` = `<your-turso-token>`
   - `CHAT_ENCRYPTION_KEY` = `<your-32-byte-key>`
   - `JWT_SECRET` = `<your-jwt-secret>`
3. Build Command: `npm run build` | Start Command: `npm start`

### Frontend Deployment (Netlify)
1. Create a new site on [Netlify](https://netlify.com) from GitHub repository `Tempora` (base directory: `frontend`).
2. Build command: `npm run build` | Publish directory: `dist`.
3. Set environment variable:
   - `VITE_API_URL` = `https://tempora-backend-production.up.railway.app`
4. Netlify automatically respects `public/_redirects` for single-page application (SPA) routing.

---

## 📁 Repository Structure

```
Tempora/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment & CORS configuration
│   │   ├── controllers/     # Room & File upload controllers
│   │   ├── database/        # Turso SQLite client & schema init
│   │   ├── middleware/      # Rate limiting & sanitization
│   │   ├── routes/          # Express REST API endpoints
│   │   ├── services/        # Room, Member, File & Message services
│   │   ├── socket/          # Socket.IO handlers & presence sync
│   │   ├── types/           # TypeScript contracts & interfaces
│   │   └── utils/           # AES-256-GCM encryption & JWT utilities
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── public/              # Static assets & Netlify _redirects
│   ├── src/
│   │   ├── components/      # UI Modals, Avatars, Buttons & Cards
│   │   ├── contexts/        # Theme & App state providers
│   │   ├── database/        # IndexedDB client & persistent storage
│   │   ├── engine/          # SyncEngine & MessageManager
│   │   ├── pages/           # LandingPage & RoomPage
│   │   ├── services/        # REST API HTTP client
│   │   ├── stores/          # Zustand state store
│   │   └── types/           # Frontend TypeScript interfaces
│   ├── netlify.toml         # Netlify SPA rewrite rules
│   ├── package.json
│   └── vite.config.ts
├── screenshots/             # Application screenshots for documentation
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🗺️ Future Roadmap

- [ ] End-to-End Client Encryption (Signal Protocol)
- [ ] WebRTC Voice & Video Channels
- [ ] Native Desktop App (Tauri / Electron)
- [ ] Mobile Applications (React Native)
- [ ] Search within active workspace session
- [ ] Granular Admin Moderation Dashboard

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
