import React, { useState, useEffect } from 'react';
import './GreetingWidget.css';

export default function GreetingWidget() {
  const [greeting] = useState('Good Afternoon');

  return (
    <div className="greeting-widget">
      <div className="greeting-title">{greeting}</div>
      <div className="greeting-sub">At your service.</div>
      <div className="greeting-sign">— J.A.R.V.I.S —</div>
    </div>
  );
}
