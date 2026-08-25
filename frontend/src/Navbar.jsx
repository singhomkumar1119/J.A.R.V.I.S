import { useState } from 'react';
import './Navbar.css';
import StatusPanel from './components/StatusPanel.jsx';
import SystemInfoWidget from './components/SystemInfoWidget.jsx';
import ActivityMonitorWidget from './components/ActivityMonitorWidget.jsx';
import LocationWidget from './components/LocationWidget.jsx';

export default function Navbar({ blobConfig, setBlobConfig, isDragging, setIsDragging, language, setLanguage, jarvisStatus }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  return (
    <nav className="navbar-container">
      {/* This background div handles the clip-path and liquid glass without clipping the dropdown */}
      <div className="navbar-bg"></div>
      
      <div className="navbar-logo">J.A.R.V.I.S.</div>
      <div className="navbar-links">
        <a className="nav-link" href="#home">HOME</a>
        <a className="nav-link" href="#dashboard">DASHBOARD</a>
        
        {/* Settings Dropdown Wrapper */}
        <div className="settings-wrapper">
          <div className="nav-link" onClick={() => setShowSettings(!showSettings)}>
            SETTINGS <span style={{fontSize: '10px', verticalAlign: 'middle'}}>▼</span>
          </div>
          
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-row">
                <label>Blob Color</label>
                <input 
                  type="color" 
                  value={blobConfig.color}
                  onChange={(e) => setBlobConfig({ ...blobConfig, color: e.target.value })}
                />
              </div>
              <div className="settings-row">
                <label>Blob Size</label>
                <input 
                  type="range" 
                  min="0.3" max="2.0" step="0.1"
                  value={blobConfig.size}
                  onChange={(e) => setBlobConfig({ ...blobConfig, size: parseFloat(e.target.value) })}
                />
              </div>
              <div className="settings-row">
                <label>Language</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn-action ${language === 'en' ? 'active' : ''}`}
                    onClick={() => setLanguage('en')}
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                  >
                    English
                  </button>
                  <button
                    className={`btn-action ${language === 'hi' ? 'active' : ''}`}
                    onClick={() => setLanguage('hi')}
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                  >
                    हिन्दी
                  </button>
                </div>
              </div>
              <div className="settings-row" style={{marginTop: '10px'}}>
                <button 
                  className={`btn-action ${isDragging ? 'active' : ''}`}
                  onClick={() => setIsDragging(!isDragging)}
                >
                  {isDragging ? 'SAVE POSITION' : 'MOVE BLOB'}
                </button>
              </div>

              <div className="settings-row" style={{marginTop: '10px'}}>
                <button
                  className={`btn-action ${showSystem ? 'active' : ''}`}
                  onClick={() => setShowSystem(!showSystem)}
                >
                  {showSystem ? 'HIDE SYSTEM INFO' : 'SHOW SYSTEM INFO'}
                </button>
              </div>

              {showSystem && (
                <div className="settings-system-info">
                  <LocationWidget />
                  <ActivityMonitorWidget status={jarvisStatus} />
                  <StatusPanel status={jarvisStatus} />
                  <SystemInfoWidget commandCount={jarvisStatus?.commandCount || 0} />
                </div>
              )}
            </div>
          )}
        </div>
        
        <a className="nav-link" href="#about">ABOUT</a>
      </div>
    </nav>
  );
}
