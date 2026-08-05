import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [logs, setLogs] = useState([]);
  const [filterSource, setFilterSource] = useState('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    // Live-updating feed of the most recent 500 logged messages. Access
    // control is enforced server-side by Firestore rules (only signed-in
    // users can read this collection at all) — this isn't just a
    // client-side gate.
    const q = query(collection(db, 'conversations'), orderBy('timestamp', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Failed to load logs:', err);
    });
    return unsub;
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError('Login failed. Check your email and password.');
    }
  };

  const formatTime = (ts) => {
    if (!ts?.toDate) return '...';
    return ts.toDate().toLocaleString();
  };

  const filteredLogs = filterSource === 'all' ? logs : logs.filter(l => l.source === filterSource);

  const containerStyle = {
    minHeight: '100vh',
    background: '#020813',
    color: '#8ff7ff',
    fontFamily: 'monospace',
    padding: '24px',
  };

  if (!authChecked) {
    return <div style={containerStyle}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{
          background: 'rgba(0,20,10,0.6)',
          border: '1px solid #1fb8ff',
          borderRadius: '8px',
          padding: '32px',
          width: '320px',
        }}>
          <h2 style={{ color: '#27e6ff', marginTop: 0 }}>J.A.R.V.I.S Admin</h2>
          <input
            type="email"
            placeholder="Admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          {loginError && <div style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '12px' }}>{loginError}</div>}
          <button type="submit" style={buttonStyle}>Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ color: '#27e6ff', margin: 0 }}>J.A.R.V.I.S Admin — Conversation Logs</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={selectStyle}>
            <option value="all">All sources</option>
            <option value="typed">Typed only</option>
            <option value="voice">Voice only</option>
            <option value="action">Actions only (app-open etc.)</option>
          </select>
          <button onClick={() => signOut(auth)} style={{ ...buttonStyle, width: 'auto', padding: '8px 16px' }}>Sign out</button>
        </div>
      </div>

      <div style={{ marginBottom: '16px', color: '#5a9', fontSize: '13px' }}>
        {filteredLogs.length} messages shown (most recent 500 total, live-updating)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredLogs.map((log) => (
          <div key={log.id} style={{
            border: '1px solid rgba(31,184,255,0.3)',
            borderRadius: '6px',
            padding: '12px 16px',
            background: 'rgba(0,20,10,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#5a9', marginBottom: '6px' }}>
              <span>{formatTime(log.timestamp)} · {log.source || 'unknown'} · session {log.sessionId?.slice(0, 8)}</span>
            </div>
            <div style={{ color: '#fff', marginBottom: '4px' }}><strong style={{ color: '#27e6ff' }}>User:</strong> {log.userText}</div>
            <div style={{ color: '#8ff7ff' }}><strong style={{ color: '#27e6ff' }}>JARVIS:</strong> {log.jarvisResponse}</div>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div style={{ color: '#5a9' }}>No conversations logged yet.</div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  marginBottom: '12px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid #1fb8ff',
  borderRadius: '4px',
  color: '#fff',
  fontFamily: 'monospace',
};

const buttonStyle = {
  width: '100%',
  padding: '10px',
  background: '#1fb8ff',
  border: 'none',
  borderRadius: '4px',
  color: '#001018',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontFamily: 'monospace',
};

const selectStyle = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid #1fb8ff',
  borderRadius: '4px',
  color: '#fff',
  padding: '8px',
  fontFamily: 'monospace',
};
