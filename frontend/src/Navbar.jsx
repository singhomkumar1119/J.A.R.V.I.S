import { useState } from 'react';
import './Navbar.css';

export default function Navbar({ blobConfig, setBlobConfig, isDragging, setIsDragging }) {
  const [showSettings, setShowSettings] = useState(false);

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
              <div className="settings-row" style={{marginTop: '10px'}}>
                <button 
                  className={`btn-action ${isDragging ? 'active' : ''}`}
                  onClick={() => setIsDragging(!isDragging)}
                >
                  {isDragging ? 'SAVE POSITION' : 'MOVE BLOB'}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <a className="nav-link" href="#about">ABOUT</a>
      </div>
    </nav>
  );
}
