import React, { useState, useEffect } from 'react';
import './SystemInfoWidget.css';

export default function SystemInfoWidget() {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }));
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN'];
      setDateStr(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="system-info-widget">
      <div className="sys-info-header">
        <span className="dot"></span> SYSTEM_INFO
      </div>

      <div className="sys-clock">{timeStr || '16:15:01'}</div>
      <div className="sys-date">{dateStr || 'SUN, FEB 8'}</div>

      <div className="weather-row">
        <span className="sun-icon">☀️</span>
        <span className="temp">30°C</span>
        <span className="cond">CLEAR</span>
      </div>

      <div className="loc-tag">📍 Bengaluru</div>

      <div className="sys-metrics">
        <div className="metric">
          <span className="m-label">UPTIME</span>
          <span className="m-val">10h</span>
        </div>
        <div className="metric">
          <span className="m-label">COMMANDS</span>
          <span className="m-val">3</span>
        </div>
      </div>
    </div>
  );
}
