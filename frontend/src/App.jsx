import { useState, useEffect } from 'react';
import VoiceBlob from './components/blob.jsx';
import Navbar from './Navbar';
import Terminal from './components/Terminal.jsx';
import Background3D from './components/Background3D.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import DraggableWidget from './components/DraggableWidget.jsx';
import LocationWidget from './components/LocationWidget.jsx';
import SystemInfoWidget from './components/SystemInfoWidget.jsx';
import ActivityMonitorWidget from './components/ActivityMonitorWidget.jsx';
import GreetingWidget from './components/GreetingWidget.jsx';

function App() {
  const [blobConfig, setBlobConfig] = useState({
    color: '#0084ff',
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

  useEffect(() => {
    const handleResize = () => {
      setScreen({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#020813'
      }}
    >
      {/* 3D Cinematic Starfield/Hologram Background */}
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
      />

      {/* Top Left: Location Widget */}
      <DraggableWidget id="location" defaultPos={{ x: 30, y: 100 }}>
        <LocationWidget />
      </DraggableWidget>

      {/* Middle Left: Activity Monitor */}
      <DraggableWidget id="activity" defaultPos={{ x: 30, y: 300 }}>
        <ActivityMonitorWidget status={jarvisStatus} />
      </DraggableWidget>

      {/* Top Right: System Diagnostics */}
      <DraggableWidget id="diagnostics" defaultPos={{ x: Math.max(20, screen.w - 280), y: 100 }}>
        <StatusPanel status={jarvisStatus} />
      </DraggableWidget>

      {/* Middle Right: System Info (Clock/Weather) */}
      <DraggableWidget id="sysinfo" defaultPos={{ x: Math.max(20, screen.w - 280), y: 350 }}>
        <SystemInfoWidget commandCount={jarvisStatus.commandCount || 0} />
      </DraggableWidget>

      {/* Bottom Center: Greeting Widget */}
      <DraggableWidget id="greeting" defaultPos={{ x: Math.max(20, screen.w / 2 - 170), y: screen.h - 180 }}>
        <GreetingWidget />
      </DraggableWidget>

      {/* Bottom Center: Voice Terminal */}
      <DraggableWidget id="terminal" defaultPos={{ x: Math.max(20, screen.w / 2 - 425), y: screen.h - 90 }}>
        <Terminal onStatusChange={setJarvisStatus} />
      </DraggableWidget>
    </div>
  );
}

export default App;
