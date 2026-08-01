import React, { useState, useEffect } from 'react';
import './SystemInfoWidget.css';

const SESSION_START = Date.now();

export default function SystemInfoWidget({ commandCount = 0 }) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [uptime, setUptime] = useState('0m');
  const [weather, setWeather] = useState({ temp: '--', condition: 'LOADING', city: 'Locating...' });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }));
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      setDateStr(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`);

      const elapsedMs = Date.now() - SESSION_START;
      const totalMinutes = Math.floor(elapsedMs / 60000);
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      setUptime(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real weather based on the browser's actual geolocation
  useEffect(() => {
    const weatherCodeMap = {
      0: 'CLEAR', 1: 'MOSTLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST',
      45: 'FOG', 48: 'FOG', 51: 'DRIZZLE', 61: 'RAIN', 63: 'RAIN',
      65: 'HEAVY RAIN', 71: 'SNOW', 80: 'SHOWERS', 95: 'THUNDERSTORM'
    };

    const fetchWeather = async (lat, lon) => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
        const data = await res.json();
        const code = data?.current?.weather_code;
        setWeather({
          temp: Math.round(data?.current?.temperature_2m ?? 0),
          condition: weatherCodeMap[code] || 'UNKNOWN',
        });
      } catch (e) {
        setWeather({ temp: '--', condition: 'UNAVAILABLE' });
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(12.9716, 77.5946), // fallback: Bengaluru
        { timeout: 8000 }
      );
    } else {
      fetchWeather(12.9716, 77.5946);
    }
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
        <span className="temp">{weather.temp}°C</span>
        <span className="cond">{weather.condition}</span>
      </div>

      <div className="sys-metrics">
        <div className="metric">
          <span className="m-label">UPTIME</span>
          <span className="m-val">{uptime}</span>
        </div>
        <div className="metric">
          <span className="m-label">COMMANDS</span>
          <span className="m-val">{commandCount}</span>
        </div>
      </div>
    </div>
  );
}
