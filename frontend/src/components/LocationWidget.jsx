import React, { useState, useEffect } from 'react';
import './LocationWidget.css';

export default function LocationWidget() {
  const [locationInfo, setLocationInfo] = useState({
    city: 'Detecting...',
    region: 'Locating GPS...',
    lat: '0.0000°',
    lng: '0.0000°',
    loading: true
  });

  useEffect(() => {
    // Fetch IP-based location first as fast fallback
    fetch('https://ipapi.co/json/')
      ? fetch('https://ipapi.co/json/')
          .then(res => res.json())
          .then(data => {
            if (data && data.city) {
              const latDir = data.latitude >= 0 ? 'N' : 'S';
              const lngDir = data.longitude >= 0 ? 'E' : 'W';
              setLocationInfo({
                city: data.city,
                region: `${data.region || ''}, ${data.country_name || ''}`,
                lat: `${Math.abs(data.latitude).toFixed(4)}° ${latDir}`,
                lng: `${Math.abs(data.longitude).toFixed(4)}° ${lngDir}`,
                loading: false
              });
            }
          })
          .catch(() => {})
      : null;

    // Use High Accuracy Browser Geolocation API
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const latDir = lat >= 0 ? 'N' : 'S';
          const lngDir = lng >= 0 ? 'E' : 'W';
          const latStr = `${Math.abs(lat).toFixed(4)}° ${latDir}`;
          const lngStr = `${Math.abs(lng).toFixed(4)}° ${lngDir}`;

          try {
            // Reverse Geocode coordinates to city/region using OpenStreetMap
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.suburb || 'Location Detected';
            const region = `${addr.state || addr.county || ''}, ${addr.country || ''}`;

            setLocationInfo({
              city,
              region,
              lat: latStr,
              lng: lngStr,
              loading: false
            });
          } catch (e) {
            setLocationInfo(prev => ({
              ...prev,
              lat: latStr,
              lng: lngStr,
              loading: false
            }));
          }
        },
        (error) => {
          console.warn("Geolocation warning:", error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  return (
    <div className="location-widget">
      <div className="location-header">
        <span className="pin-icon">📍</span> REAL-TIME LOCATION
      </div>
      <div className="location-name">{locationInfo.city}</div>
      <div className="location-sub">{locationInfo.region}</div>
      <div className="location-coords">
        LAT: {locationInfo.lat} | LNG: {locationInfo.lng}
      </div>
    </div>
  );
}
