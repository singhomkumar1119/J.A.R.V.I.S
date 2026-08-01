import React, { useState, useEffect } from 'react';
import './ActivityMonitorWidget.css';

export default function ActivityMonitorWidget({ status }) {
  const isListening = status?.isListening;
  const isProcessing = status?.isProcessing;
  const isSpeaking = status?.isSpeaking;

  const [battery, setBattery] = useState(null);
  const [charging, setCharging] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [connType, setConnType] = useState('UNKNOWN');

  useEffect(() => {
    // Real battery status (Chrome/Android supports this; Safari/iOS/Firefox do not)
    if ('getBattery' in navigator) {
      navigator.getBattery().then((batt) => {
        const update = () => {
          setBattery(Math.round(batt.level * 100));
          setCharging(batt.charging);
        };
        update();
        batt.addEventListener('levelchange', update);
        batt.addEventListener('chargingchange', update);
      });
    }

    // Real online/offline status
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Real connection type where supported (Chrome/Android)
    const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    if (conn) {
      const updateConn = () => setConnType((conn.effectiveType || 'unknown').toUpperCase());
      updateConn();
      conn.addEventListener('change', updateConn);
    }

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div className="activity-monitor-widget">
      <div className="act-header">SYSTEM STATUS</div>

      <div className="grid-status">
        <div className="stat-card">
          <span className="sc-label">BATTERY</span>
          <span className="sc-val">{battery !== null ? `${battery}% ${charging ? '⚡' : ''}` : 'N/A'}</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">NETWORK</span>
          <span className={`sc-val ${online ? 'online' : ''}`}>{online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">CONNECTION</span>
          <span className="sc-val">{connType}</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">BLUETOOTH</span>
          <span className="sc-val">N/A</span>
        </div>
      </div>

      <div className="act-divider">ACTIVITY MONITOR</div>

      <div className="activity-pill">
        <span className="pill-icon">💡</span>
        <span className="pill-text">
          {isSpeaking ? 'SPEAKING' : isProcessing ? 'PROCESSING' : isListening ? 'LISTENING' : 'STANDBY'}
        </span>
      </div>

      <div className="act-logs">
        <div className="act-log active">LISTENING</div>
        <div className="act-log">RESPONDING</div>
        <div className="act-log">COMMAND RECEIVED</div>
        <div className="act-log">PROCESSING</div>
        <div className="act-log">STANDBY</div>
      </div>
    </div>
  );
}
