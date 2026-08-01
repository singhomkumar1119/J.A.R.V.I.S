import React, { useState, useEffect } from 'react';
import './GreetingWidget.css';

export default function GreetingWidget() {
  const [greeting, setGreeting] = useState('Good Afternoon, Sir');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning, Sir');
    else if (hour < 17) setGreeting('Good Afternoon, Sir');
    else setGreeting('Good Evening, Sir');
  }, []);

  return (
    <div className="greeting-widget">
      <div className="greeting-title">{greeting}</div>
      <div className="greeting-sub">At your service, sir.</div>
      <div className="greeting-sign">— J.A.R.V.I.S —</div>
    </div>
  );
}
