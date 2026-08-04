import { useState, useEffect, useRef } from 'react';
import Groq from 'groq-sdk';
import './Terminal.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true 
});

export default function Terminal({ onStatusChange }) {
  const [history, setHistory] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [inputText, setInputText] = useState('');
  const [latestResponse, setLatestResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micAllowed, setMicAllowed] = useState(false);
  const [commandCount, setCommandCount] = useState(0);
  const [debugError, setDebugError] = useState(null);
  const [micLog, setMicLog] = useState('Waiting for mic activity...');
  
  const recognitionRef = useRef(null);
  const isAllowedRef = useRef(true);
  const shouldListenRef = useRef(false);
  // Tracks the user's actual intent (mic toggled on/off), separate from
  // shouldListenRef which also gets paused/resumed automatically while
  // JARVIS is speaking. This stops JARVIS's own replies from accidentally
  // flipping the mic back on after the user has explicitly turned it off.
  const micEnabledRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const currentInterimRef = useRef('');
  const stallTimerRef = useRef(null);

  // Report status changes to parent
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange({
        isListening,
        isProcessing,
        isSpeaking,
        micAllowed: micAllowed,
        commandCount
      });
    }
  }, [isListening, isProcessing, isSpeaking, micAllowed, commandCount, onStatusChange]);

  // Builds and starts a completely FRESH SpeechRecognition instance every
  // single time. Reusing the same instance across many start/stop cycles
  // is a known cause of Android Chrome silently "listening" without ever
  // actually capturing audio again — a fresh object each time avoids that
  // corrupted-state bug entirely.
  const clearStallTimer = () => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = null;
  };

  const startRecognitionSession = () => {
    if (!SpeechRecognition) return;

    // Tear down any previous instance cleanly first.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    const armStallTimer = () => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(() => {
        setMicLog('⏱️ no audio detected for a while, restarting mic session...');
        try { recognition.abort(); } catch (e) {}
      }, 6000);
    };

    recognition.onstart = () => {
      setIsListening(true);
      isAllowedRef.current = true;
      setMicAllowed(true);
      setMicLog('🎙️ recognition started — listening (fresh session)...');
      armStallTimer();
    };

    recognition.onspeechstart = () => {
      setMicLog('🗣️ speech detected...');
      clearStallTimer();
    };

    recognition.onresult = (event) => {
      clearStallTimer();
      if (!shouldListenRef.current) {
        setMicLog('⚠️ got result but shouldListen=false, ignoring');
        return;
      }

      let finalText = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      const activeText = (finalText || currentInterim).trim();
      currentInterimRef.current = activeText;
      setInterimText(activeText);
      setMicLog(`📝 heard: "${activeText}"`);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      if (activeText.length > 2) {
        silenceTimerRef.current = setTimeout(() => {
          if (currentInterimRef.current && shouldListenRef.current && !isProcessing && !isSpeaking) {
            const textToSend = currentInterimRef.current;
            currentInterimRef.current = '';
            setMicLog(`📤 sending: "${textToSend}"`);
            processWithGroq(textToSend);
          }
        }, 700);
      }
    };

    recognition.onerror = (event) => {
      clearStallTimer();
      setMicLog(`❌ recognition error: ${event.error}`);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        isAllowedRef.current = false;
        micEnabledRef.current = false;
        setMicAllowed(false);
        setLatestResponse('Microphone access denied. Click 🎙️ to allow.');
      }
    };

    recognition.onend = () => {
      clearStallTimer();
      setMicLog(prev => prev + ' → ended');

      const willRestart = isAllowedRef.current && shouldListenRef.current;

      // Only show "not listening" in the UI if we're actually stopping —
      // if we're about to auto-restart a fresh session (the normal case
      // whenever there's a pause in speech), keep the mic button looking
      // active the whole time instead of flickering off and on.
      if (!willRestart) {
        setIsListening(false);
      }

      if (willRestart) {
        setTimeout(() => {
          if (shouldListenRef.current) {
            try {
              startRecognitionSession();
            } catch (e) {
              setMicLog(`❌ restart failed: ${e.message}`);
              setIsListening(false);
            }
          } else {
            setIsListening(false);
          }
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      setMicLog(`❌ recognition.start() threw: ${e.message}`);
    }
  };

  // Request Microphone Access manually via user click
  const requestMicAccess = async () => {
    setMicLog('🔑 requesting mic permission...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicLog('✅ mic permission granted, starting recognition...');

      isAllowedRef.current = true;
      setMicAllowed(true);
      shouldListenRef.current = true;
      micEnabledRef.current = true;
      setLatestResponse('Microphone access granted.');

      startRecognitionSession();
    } catch (e) {
      console.warn("Microphone access denied:", e);
      setMicLog(`❌ getUserMedia failed: ${e.name} - ${e.message}`);
      isAllowedRef.current = false;
      micEnabledRef.current = false;
      setMicAllowed(false);
      setLatestResponse('Microphone access denied. Click mic button to enable.');
    }
  };

  // Mic button now properly toggles: tap once to turn on, tap again to
  // turn off. Previously it only ever tried to (re)start, so there was
  // no way to switch it off from the UI.
  const toggleMic = () => {
    if (isListening) {
      shouldListenRef.current = false;
      micEnabledRef.current = false;
      setIsListening(false);
      setMicLog('🔇 microphone turned off');
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      return;
    }
    requestMicAccess();
  };

  // Pre-fetch voices (voices load asynchronously on many mobile browsers)
  const voicesRef = useRef([]);
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speakResponse = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.warn('speechSynthesis not supported on this browser');
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);

      const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
      const jarvisVoice = voices.find(v => 
        v.name.includes('Google UK English Male') || 
        v.name.includes('Microsoft Mark') || 
        (v.lang.includes('en-GB') && v.name.includes('Male'))
      ) || voices[0];
      
      if (jarvisVoice) {
        utterance.voice = jarvisVoice;
      }
      
      utterance.pitch = 0.85;
      utterance.rate = 1.05;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        setIsSpeaking(false);
        // Only resume listening if the user actually had the mic on —
        // otherwise JARVIS speaking a typed-chat reply would silently
        // flip the mic back on even after the user turned it off.
        shouldListenRef.current = micEnabledRef.current;
        resolve();
      };

      // Safety net: some mobile browsers silently hang and never fire
      // onstart/onend/onerror, which would freeze the app forever.
      const safetyTimer = setTimeout(() => {
        console.warn('speechSynthesis timed out — forcing resume');
        finish();
      }, 8000);

      utterance.onstart = () => {
        setIsSpeaking(true);
        shouldListenRef.current = false;
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (e) {}
        }
      };
      
      utterance.onend = finish;
      
      utterance.onerror = (e) => {
        console.error('speechSynthesis error:', e.error);
        finish();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  // Automatic greeting on load: "Good Morning/Afternoon/Evening, Sir.
  // How can I help you, sir?" — spoken once, time-of-day aware.
  useEffect(() => {
    let spoken = false;

    const buildGreeting = () => {
      const hour = new Date().getHours();
      let g = 'Good evening, Om.';
      if (hour < 12) g = 'Good morning, Om.';
      else if (hour < 17) g = 'Good afternoon, Om.';
      return `${g} How can I help you?`;
    };

    const attemptGreeting = () => {
      if (spoken) return;
      const text = buildGreeting();
      setLatestResponse(text);

      if (!('speechSynthesis' in window)) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
      const jarvisVoice = voices.find(v =>
        v.name.includes('Google UK English Male') ||
        v.name.includes('Microsoft Mark') ||
        (v.lang.includes('en-GB') && v.name.includes('Male'))
      ) || voices[0];
      if (jarvisVoice) utterance.voice = jarvisVoice;
      utterance.pitch = 0.85;
      utterance.rate = 1.05;

      // Only mark as truly spoken once audio actually starts — some
      // mobile browsers silently block speechSynthesis.speak() before
      // any real user interaction, without throwing an error.
      utterance.onstart = () => {
        spoken = true;
        document.removeEventListener('click', attemptGreeting);
        document.removeEventListener('touchstart', attemptGreeting);
      };

      window.speechSynthesis.speak(utterance);
    };

    // Try right away (works on desktop and browsers that allow it)
    const initialTimer = setTimeout(attemptGreeting, 400);

    // Fallback: if autoplay was blocked, speak on the first real tap
    document.addEventListener('click', attemptGreeting);
    document.addEventListener('touchstart', attemptGreeting);

    return () => {
      clearTimeout(initialTimer);
      document.removeEventListener('click', attemptGreeting);
      document.removeEventListener('touchstart', attemptGreeting);
    };
  }, []);

  // Action executor for commands like "open whatsapp", "search ...", etc.
  // Ordered from most specific phrase to least specific, so "open google docs"
  // matches Docs before the generic "google" catch-all further down.
  const APP_LINKS = [
    { keys: ['google docs', 'open docs'], url: 'https://docs.google.com', name: 'Google Docs' },
    { keys: ['google sheets', 'open sheets'], url: 'https://sheets.google.com', name: 'Google Sheets' },
    { keys: ['google drive', 'open drive'], url: 'https://drive.google.com', name: 'Google Drive' },
    { keys: ['google maps', 'open maps'], url: 'https://maps.google.com', name: 'Google Maps' },
    { keys: ['google calendar', 'open calendar'], url: 'https://calendar.google.com', name: 'Google Calendar' },
    { keys: ['gmail', 'open email', 'open mail'], url: 'https://mail.google.com', name: 'Gmail' },
    { keys: ['whatsapp'], url: 'https://web.whatsapp.com', name: 'WhatsApp' },
    { keys: ['telegram'], url: 'https://web.telegram.org', name: 'Telegram' },
    { keys: ['instagram'], url: 'https://www.instagram.com', name: 'Instagram' },
    { keys: ['facebook'], url: 'https://www.facebook.com', name: 'Facebook' },
    { keys: ['twitter', 'open x'], url: 'https://www.x.com', name: 'X' },
    { keys: ['linkedin'], url: 'https://www.linkedin.com', name: 'LinkedIn' },
    { keys: ['tiktok'], url: 'https://www.tiktok.com', name: 'TikTok' },
    { keys: ['snapchat'], url: 'https://web.snapchat.com', name: 'Snapchat' },
    { keys: ['pinterest'], url: 'https://www.pinterest.com', name: 'Pinterest' },
    { keys: ['notion'], url: 'https://www.notion.so', name: 'Notion' },
    { keys: ['trello'], url: 'https://trello.com', name: 'Trello' },
    { keys: ['slack'], url: 'https://slack.com', name: 'Slack' },
    { keys: ['netflix'], url: 'https://www.netflix.com', name: 'Netflix' },
    { keys: ['prime video', 'amazon prime'], url: 'https://www.primevideo.com', name: 'Prime Video' },
    { keys: ['hotstar', 'disney plus', 'disney+'], url: 'https://www.hotstar.com', name: 'Hotstar' },
    { keys: ['twitch'], url: 'https://www.twitch.tv', name: 'Twitch' },
    { keys: ['amazon'], url: 'https://www.amazon.in', name: 'Amazon' },
    { keys: ['flipkart'], url: 'https://www.flipkart.com', name: 'Flipkart' },
    { keys: ['chatgpt'], url: 'https://chat.openai.com', name: 'ChatGPT' },
    { keys: ['claude'], url: 'https://claude.ai', name: 'Claude' },
    { keys: ['stack overflow', 'stackoverflow'], url: 'https://stackoverflow.com', name: 'Stack Overflow' },
    { keys: ['spotify'], url: 'https://open.spotify.com', name: 'Spotify' },
    { keys: ['reddit'], url: 'https://www.reddit.com', name: 'Reddit' },
    { keys: ['github'], url: 'https://www.github.com', name: 'GitHub' },
    { keys: ['youtube'], url: 'https://www.youtube.com', name: 'YouTube' },
    { keys: ['google'], url: 'https://www.google.com', name: 'Google' },
  ];

  const executeLocalAction = (userText) => {
    const text = userText.toLowerCase().trim();
    // Strip spaces and apostrophes so speech-to-text quirks like
    // "what's app" / "linked in" still match "whatsapp" / "linkedin".
    const normalize = (s) => s.replace(/['\u2019]/g, '').replace(/\s+/g, '');
    const normText = normalize(text);

    for (const app of APP_LINKS) {
      if (app.keys.some(key => normText.includes(normalize(key)))) {
        window.open(app.url, '_blank');
        return `Opening ${app.name} for you, Om.`;
      }
    }

    if (text.startsWith('search ') || text.startsWith('google ')) {
      const q = text.replace(/^(search|google)\s+/i, '');
      window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
      return `Searching Google for ${q}, Om.`;
    }
    if (text.startsWith('play ')) {
      const song = text.replace(/^play\s+/i, '');
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`, '_blank');
      return `Searching YouTube for ${song}, Om.`;
    }

    return null;
  };

  const processWithGroq = async (userText) => {
    if (!userText || userText.trim().length === 0) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    currentInterimRef.current = '';
    setInterimText('');
    setInputText('');

    setIsProcessing(true);
    setLatestResponse('');
    setDebugError(null);
    setCommandCount(prev => prev + 1);
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    // Check for local instant action commands first
    const actionResult = executeLocalAction(userText);
    if (actionResult) {
      setHistory(prev => [...prev, 
        { role: 'user', text: userText },
        { role: 'assistant', text: actionResult }
      ]);
      setLatestResponse(actionResult);
      await speakResponse(actionResult);
      setIsProcessing(false);
      if (micEnabledRef.current) {
        shouldListenRef.current = true;
        if (isAllowedRef.current) startRecognitionSession();
      }
      return;
    }

    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const timeString = now.toLocaleTimeString('en-US');

      const messages = [
        { 
          role: 'system', 
          content: `You are J.A.R.V.I.S., a highly advanced AI assistant serving a user named Om. Address him as "Om" (not "sir") when it feels natural. Today's real date is ${dateString}, current time ${timeString}. Always treat this as the true current date, not any date you might otherwise assume from training. Use web search whenever a question depends on current, live, recent, or specific factual information (news, weather, prices, sports scores, people, places, releases, events, general knowledge, etc.) — always prefer the latest available information over older knowledge, and default to the newest/most recent facts unless the user asks about the past specifically. Keep your answers brief, clear, and direct, suitable for speech synthesis. Do not use markdown or emojis.` 
        },
        ...history.slice(-6).map(msg => ({ role: msg.role, content: msg.text })),
        { role: 'user', content: userText }
      ];

      // Web search adds real round-trip latency (the model has to make a
      // tool call before it can answer), which was making EVERY reply feel
      // slow — including "hello" or "what's your name". Only pay that cost
      // when the question actually needs current/live info; otherwise use
      // the much faster plain model.
      const needsLiveSearch = (text) => {
        const t = text.toLowerCase();
        const keywords = [
          'today', 'now', 'current', 'currently', 'latest', 'news', 'weather',
          'price', 'stock', 'score', 'forecast', 'temperature', 'live',
          'recent', 'this week', 'this year', 'who won', 'who is the',
          'when is', 'when did', 'release date', 'update', 'happening',
          'right now',
        ];
        return keywords.some(k => t.includes(k));
      };
      const selectedModel = needsLiveSearch(userText) ? 'groq/compound-mini' : 'openai/gpt-oss-20b';

      const completion = await groq.chat.completions.create({
        messages: messages,
        model: selectedModel,
        temperature: 0.6,
        max_tokens: 180,
      });

      const jarvisResponse = completion.choices[0]?.message?.content || "I couldn't process that, Om.";

      // Surface which web sources (if any) were used, for transparency —
      // shown in the UI only, never read aloud by TTS.
      const searchResults = completion.choices[0]?.message?.executed_tools?.[0]?.search_results;
      if (searchResults && searchResults.length > 0) {
        const sourceNames = searchResults.slice(0, 3).map(r => r.title || r.url).filter(Boolean);
        if (sourceNames.length > 0) {
          setMicLog(`🌐 sources: ${sourceNames.join(' | ')}`);
        }
      }
      
      setHistory(prev => [...prev, 
        { role: 'user', text: userText },
        { role: 'assistant', text: jarvisResponse }
      ]);
      setLatestResponse(jarvisResponse);
      
      await speakResponse(jarvisResponse);

    } catch (error) {
      console.error("Groq Error:", error);
      const detail = error?.error?.error?.message || error?.message || 'Unknown error';
      const errorMsg = `Error: ${detail}`;
      setDebugError(errorMsg);
      setHistory(prev => [...prev,
        { role: 'user', text: userText },
        { role: 'assistant', text: errorMsg }
      ]);
      setLatestResponse(errorMsg);
      await speakResponse('System connection error.');
    } finally {
      setIsProcessing(false);
      if (micEnabledRef.current) {
        shouldListenRef.current = true;
        if (isAllowedRef.current) startRecognitionSession();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputText.trim()) {
      processWithGroq(inputText.trim());
    }
  };

  // Just a support check + unmount cleanup now — actual recognition
  // lifecycle is handled by startRecognitionSession() (see above), which
  // creates a fresh instance every time rather than reusing one long-lived
  // object across the whole session.
  useEffect(() => {
    if (!SpeechRecognition) {
      setLatestResponse('Speech recognition unsupported.');
      setMicAllowed(false);
      return;
    }

    return () => {
      clearStallTimer();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch (e) {}
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const getPlaceholderText = () => {
    if (!micAllowed) return "mic access denied — type command here & press enter...";
    if (interimText) return interimText.toLowerCase();
    if (isProcessing) return "analyzing request...";
    if (latestResponse) return latestResponse.toLowerCase();
    if (isListening) return "type a command or speak into mic...";
    return "initializing core systems...";
  };

  return (
    <div className="jarvis-terminal">
      {debugError && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#3a0000',
          color: '#ff6b6b',
          border: '1px solid #ff0000',
          padding: '10px 16px',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '13px',
          zIndex: 9999,
          maxWidth: '90vw',
          textAlign: 'center'
        }}>
          {debugError}
        </div>
      )}
      <div style={{
        position: 'fixed',
        top: debugError ? '55px' : '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,20,10,0.9)',
        color: '#00ffaa',
        border: '1px solid #00ffaa',
        padding: '6px 14px',
        borderRadius: '6px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 9998,
        maxWidth: '90vw',
        textAlign: 'center'
      }}>
        MIC DEBUG: {micLog}
      </div>
      <div className="jarvis-terminal-bar">
        <button 
          className={`jarvis-mic-btn ${micAllowed ? (isListening ? 'active' : '') : 'denied'}`}
          onClick={toggleMic}
          title={micAllowed ? "Microphone Active (Click to re-authorize)" : "Click to Enable Microphone Access"}
        >
          {micAllowed ? '🎙️' : '🎙️❌'}
        </button>

        <span className="jarvis-prompt">$ J.A.R.V.I.S. &gt;</span>
        <div className="jarvis-text-container">
          <input
            type="text"
            className="jarvis-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholderText()}
          />
        </div>
        <button 
          className="jarvis-send-btn"
          onClick={() => inputText.trim() && processWithGroq(inputText.trim())}
          title="Send Command"
        >
          SEND
        </button>
      </div>
      <div className="jarvis-terminal-handle"></div>
    </div>
  );
}
