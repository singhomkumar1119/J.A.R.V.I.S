# J.A.R.V.I.S — Frontend overview

## What this is
A single-page React + Vite front-end that provides a desktop-like "J.A.R.V.I.S" UI: a 3D holo background, a 3D voice blob, draggable widgets (terminal, system info, activity monitor, etc.), and an admin view — intended as a browser-based personal assistant / dashboard UI. It’s the front-end portion of that project (no visible backend at repo root).

### Stack
- **Language(s):** JavaScript (primary), CSS, HTML
- **Framework / runtime:** React (functional components) + Vite (dev/build)
- **Notable libraries:** react, three / @react-three/fiber + @react-three/drei (3D scene), firebase (persistence/auth), framer-motion (UI animation)

## How it's organized
```
.github/                          CI / repository metadata (present at top level)
frontend/                        Vite + React application
  .env.example                   example env (Firebase / secrets hint)
  package.json                   dependencies & scripts (vite, build, preview)
  vite.config.js                 Vite config
  index.html                     app entry html
  src/
    main.jsx                     React entry (createRoot)
    App.jsx                      App composition — mounts background, blob, widgets
    firebase.js                   Firebase setup (client-side config)
    logConversation.js           conversation logging helper
    index.css / App.css / Navbar.css  global & component styles
    components/
      Terminal.jsx               Voice terminal / interaction UI (large file)
      Background3D.jsx           3D starfield / hologram background
      blob.jsx                   3D voice blob visualization
      DraggableWidget.jsx        Wrapper enabling movable widgets
      StatusPanel.jsx            system diagnostics / status panel
      SystemInfoWidget.jsx       clock/weather/system info
      ActivityMonitorWidget.jsx  activity/metrics widget
      LocationWidget.jsx         location display
      GreetingWidget.jsx         welcome UI
      AdminDashboard.jsx         admin route (rendered at #admin)
```

How it fits together:
- App.jsx is the SPA root and composes the app: it mounts Background3D and a central 3D VoiceBlob, then wraps functional parts (Terminal, StatusPanel, SystemInfoWidget, etc.) in DraggableWidget so users can reposition them. Terminal and logConversation.js handle voice interactions and persisting/logging conversations; firebase.js shows client-side Firebase is used for storage/auth. The 3D visuals are implemented with three.js via @react-three/fiber and @react-three/drei.

## How to run it
The shortest path to run the front-end locally (from a fresh clone):

```bash
cd frontend
npm install
npm run dev
```

- Available npm scripts (from frontend/package.json): dev (vite), build (vite build), preview (vite preview), lint.
- There is a frontend/.env.example present — you should copy that to frontend/.env and populate any Firebase keys or other environment variables before running if the app expects them (firebase client config is present in the codebase).

## Try asking
- "Where are conversations stored — can you point me to the code that writes to Firebase? (I see frontend/src/logConversation.js and frontend/src/firebase.js.)"
- "How is voice capture/recognition implemented in Terminal.jsx and blob.jsx — does it use Web Speech / WebAudio APIs or a remote service?"
- "Is there a backend or server component for processing commands, or is everything handled client-side and stored in Firebase? (I couldn't find a top-level server directory.)"
