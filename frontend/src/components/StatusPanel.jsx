import { useState, useEffect } from 'react';
import './StatusPanel.css';

export default function StatusPanel({ status }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status-panel-container">
      <div className="status-panel-bg"></div>
      <div className="status-header">SYSTEM DIAGNOSTICS</div>
      
      <div className="status-list">
        <div className="status-item">
          <span className="status-label">SYS.ONLINE</span>
          <span className="status-value success">TRUE</span>
        </div>
        
        <div className="status-item">
          <span className="status-label">J.A.R.V.I.S</span>
          <span className={`status-value ${status.isProcessing || status.isSpeaking || status.isListening ? 'success' : 'standby'}`}>
            {status.isSpeaking ? 'TRANSMITTING' : status.isProcessing ? 'PROCESSING' : 'ONLINE'}
          </span>
        </div>
        
        <div className="status-item">
          <span className="status-label">MIC.ACCESS</span>
          <span className={`status-value ${status.micAllowed ? 'success' : 'error'}`}>
            {status.micAllowed ? 'GRANTED' : 'DENIED'}
          </span>
        </div>
        
        <div className="status-item">
          <span className="status-label">MIC.STATE</span>
          <span className={`status-value ${status.isListening ? 'success' : 'standby'}`}>
            {status.isListening ? 'ACTIVE' : 'MUTED'}
          </span>
        </div>

        <div className="status-item">
          <span className="status-label">TTS.ENGINE</span>
          <span className={`status-value ${status.isSpeaking ? 'success' : 'standby'}`}>
            {status.isSpeaking ? 'SPEAKING' : 'IDLE'}
          </span>
        </div>

        <div className="status-item">
          <span className="status-label">API.LINK</span>
          <span className="status-value success">CONNECTED</span>
        </div>
      </div>
      
      <div className="status-footer">
        {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
      </div>
    </div>
  );
}
