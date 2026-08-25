import { useState, useEffect } from 'react';
import VoiceBlob from './components/blob.jsx';
import Navbar from './Navbar';
import Terminal from './components/Terminal.jsx';
import Background3D from './components/Background3D.jsx';
import DraggableWidget from './components/DraggableWidget.jsx';
import GreetingWidget from './components/GreetingWidget.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import './App.css';

function App() {
  const [blobConfig, setBlobConfig] = useState({
    color: localStorage.getItem('jarvis_blob_color') || '#9333ea',
    size: 1,
    position: { x: 0, y: 0 }
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [jarvisStatus, setJarvisStatus] = useState({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    micAllowed: true
  });

  const [screen, setScreen] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  const [language, setLanguage] = useState(localStorage.getItem('jarvis_language') || 'en');

  useEffect(() => {
    if (language) {
      localStorage.setItem('jarvis_language', language);
    }
  }, [language]);

  const [route, setRoute] = useState(typeof window !== 'undefined' ? window.location.hash : '');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setScreen({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (blobConfig.color) {
      localStorage.setItem('jarvis_blob_color', blobConfig.color);
    }
  }, [blobConfig.color]);

  if (route === '#admin') {
    return <AdminDashboard />;
  }

  return (
    <div 
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0a0118'
      }}
    >
      {/* Slowly morphing purple/pink/black gradient — the "liquid" feel */}
      <div className="jarvis-morph-bg" />

      {/* 3D Cinematic Starfield Background */}
      <Background3D />

      {/* 3D Voice Blob - Fixed Center */}
      <VoiceBlob 
        config={blobConfig} 
        setConfig={setBlobConfig} 
        isDragging={isDragging} 
      />
      
      {/* Fixed Foreground Navbar */}
      <Navbar 
        blobConfig={blobConfig} 
        setBlobConfig={setBlobConfig}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        language={language}
        setLanguage={setLanguage}
        jarvisStatus={jarvisStatus}
      />

      {/* Bottom Center: Greeting Widget */}
      <DraggableWidget id="greeting" defaultPos={{ x: Math.max(20, screen.w / 2 - 170), y: screen.h - 180 }}>
        <GreetingWidget />
      </DraggableWidget>

      {/* Bottom Center: Voice Terminal */}
      <DraggableWidget id="terminal" defaultPos={{ x: Math.max(20, screen.w / 2 - 425), y: screen.h - 90 }}>
        <Terminal onStatusChange={setJarvisStatus} language={language} />
      </DraggableWidget>

      {/* Privacy notice — conversations are logged, visitors should know */}
      <div style={{
        position: 'fixed',
        bottom: '4px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '10px',
        color: 'rgba(236, 143, 255, 0.35)',
        fontFamily: 'monospace',
        zIndex: 5,
        pointerEvents: 'none',
      }}>
        Conversations with J.A.R.V.I.S may be logged for improvement purposes.
      </div>
    </div>
  );
}

export default App;
