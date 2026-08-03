import React, { useState, useEffect } from 'react';
import './GreetingWidget.css';

export default function GreetingWidget() {
  const [greeting, setGreeting] = useState('Good Afternoon');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  return (
    <div className="greeting-widget">
      <div className="greeting-title">{greeting}</div>
      <div className="greeting-sub">At your service.</div>
      <div className="greeting-sign">— J.A.R.V.I.S —</div>
    </div>
  );
}
