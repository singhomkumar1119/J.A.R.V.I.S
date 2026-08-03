import React, { useState, useEffect } from 'react';
import './GreetingWidget.css';

export default function GreetingWidget() {
  const [greeting, setGreeting] = useState('Good Afternoon, Om');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning, Om');
    else if (hour < 17) setGreeting('Good Afternoon, Om');
    else setGreeting('Good Evening, Om');
  }, []);

  return (
    <div className="greeting-widget">
      <div className="greeting-title">{greeting}</div>
      <div className="greeting-sub">At your service, Om.</div>
      <div className="greeting-sign">— J.A.R.V.I.S —</div>
    </div>
  );
}
