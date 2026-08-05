import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// One random ID per browser tab session, so messages from the same visit
// can be grouped together in the admin dashboard.
const SESSION_ID = (() => {
  try {
    let id = sessionStorage.getItem('jarvis_session_id');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('jarvis_session_id', id);
    }
    return id;
  } catch (e) {
    return 'unknown-session';
  }
})();

// Fire-and-forget: logging failures must never break the actual chat
// experience for the visitor, so errors are swallowed (just logged to
// console for our own debugging).
export function logConversation({ userText, jarvisResponse, source }) {
  try {
    addDoc(collection(db, 'conversations'), {
      userText: userText || '',
      jarvisResponse: jarvisResponse || '',
      source: source || 'unknown', // 'typed' | 'voice' | 'action'
      sessionId: SESSION_ID,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
    }).catch((err) => {
      console.warn('JARVIS conversation log failed:', err);
    });
  } catch (err) {
    console.warn('JARVIS conversation log failed:', err);
  }
}
