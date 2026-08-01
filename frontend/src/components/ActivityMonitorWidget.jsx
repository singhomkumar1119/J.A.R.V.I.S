import React from 'react';
import './ActivityMonitorWidget.css';

export default function ActivityMonitorWidget({ status }) {
  const isListening = status?.isListening;
  const isProcessing = status?.isProcessing;
  const isSpeaking = status?.isSpeaking;

  return (
    <div className="activity-monitor-widget">
      <div className="act-header">SYSTEM STATUS</div>

      <div className="grid-status">
        <div className="stat-card">
          <span className="sc-label">BATTERY</span>
          <span className="sc-val">61% ⚡</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">NETWORK</span>
          <span className="sc-val online">ONLINE</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">CONNECTION</span>
          <span className="sc-val">4G</span>
        </div>
        <div className="stat-card">
          <span className="sc-label">BLUETOOTH</span>
          <span className="sc-val ready">READY</span>
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
