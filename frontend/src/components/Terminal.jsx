import { useState, useEffect, useRef } from 'react';
import './Terminal.css';
import { logConversation } from '../logConversation';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Mic, MicOff } from 'lucide-react';

// All AI calls now go through our own backend (/api/*) instead of hitting
// Groq/Sarvam/NVIDIA directly from the browser. This keeps API keys
// server-side only, and is required for NVIDIA specifically since their
// API has no CORS support for direct browser calls.

// Tuning for the volume-based silence detector (replaces the old browser
// SpeechRecognition silence handling). RMS is measured on a 0-128 scale
// from time-domain audio data.
const SILENCE_RMS_THRESHOLD = 10;
const SILENCE_STOP_MS = 900;      // stop recording after this much silence following speech
const NO_SPEECH_TIMEOUT_MS = 7000; // give up and restart if nothing is said at all
const MAX_RECORDING_MS = 15000;    // hard safety cap per recording

export default function Terminal({ onStatusChange, language = 'en' }) {
  // Debug UI (MIC DEBUG bar, red error banners) is only for troubleshooting
  // and shouldn't be visible to normal visitors. Add ?debug=1 to the URL
  // to see it — invisible otherwise, so the app looks clean when shown to
  // people.
  const devMode = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  const [history, setHistory] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [latestResponse, setLatestResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micAllowed, setMicAllowed] = useState(false);
  const [commandCount, setCommandCount] = useState(0);
  const [debugError, setDebugError] = useState(null);
  const [micLog, setMicLog] = useState('Waiting for mic activity...');

  const isAllowedRef = useRef(true);
  const shouldListenRef = useRef(false);
  // Tracks the user's actual intent (mic toggled on/off), separate from
  // shouldListenRef which also gets paused/resumed automatically while
  // JARVIS is speaking. This stops JARVIS's own replies from accidentally
  // flipping the mic back on after the user has explicitly turned it off.
  const micEnabledRef = useRef(false);

  // --- Recording pipeline refs (MediaRecorder + Web Audio VAD) ---
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const vadRafRef = useRef(null);
  const hasDetectedSpeechRef = useRef(false);
  const silenceStartRef = useRef(null);
  const recordingStartRef = useRef(null);
  const shouldSendAfterStopRef = useRef(false);
  const currentAudioRef = useRef(null);

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

  const stopMediaTracks = () => {
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
  };

  // Stops the current recording session immediately without sending
  // anything for transcription and without auto-restarting. Used when
  // JARVIS starts speaking, when the user turns the mic off, or on unmount.
  const haltRecording = () => {
    shouldSendAfterStopRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    stopMediaTracks();
  };

  // Plays a Blob of audio, with a fallback for mobile browsers that block
  // autoplay until a real user gesture: if .play() is rejected, it waits
  // for the next tap/click anywhere on the page and retries on the same
  // already-loaded audio element (no re-fetch needed).
  const playAudioBlob = (blob) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        document.removeEventListener('click', retryPlay);
        document.removeEventListener('touchstart', retryPlay);
        clearTimeout(safetyTimer);
        resolve();
      };

      const retryPlay = () => {
        audio.play().catch(() => {});
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      audio.play().then(() => {
        document.removeEventListener('click', retryPlay);
        document.removeEventListener('touchstart', retryPlay);
      }).catch(() => {
        document.addEventListener('click', retryPlay);
        document.addEventListener('touchstart', retryPlay);
      });

      const safetyTimer = setTimeout(cleanup, 20000);
    });
  };

  // Orpheus rejects input over 200 characters, so long replies need to be
  // split into chunks and spoken back-to-back. Splits on sentence
  // boundaries where possible so each chunk still sounds natural, falling
  // back to splitting on spaces if a single sentence is itself too long.
  const chunkTextForTTS = (text, maxLen = 180) => {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    const chunks = [];
    let current = '';

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      if (sentence.length > maxLen) {
        // A single sentence is itself too long — hard-split on words.
        const words = sentence.split(' ');
        let piece = '';
        for (const word of words) {
          if ((piece + ' ' + word).trim().length > maxLen) {
            if (piece) chunks.push(piece.trim());
            piece = word;
          } else {
            piece = (piece + ' ' + word).trim();
          }
        }
        if (piece) {
          if ((current + ' ' + piece).trim().length <= maxLen) {
            current = (current + ' ' + piece).trim();
          } else {
            if (current) chunks.push(current);
            current = piece;
          }
        }
        continue;
      }

      if ((current + ' ' + sentence).trim().length <= maxLen) {
        current = (current + ' ' + sentence).trim();
      } else {
        if (current) chunks.push(current);
        current = sentence;
      }
    }
    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
  };

  // Sarvam's Bulbul v3 handles long text in one request (no 200-char
  // limit like Orpheus), so no chunking needed for Hindi.
  const speakHindiViaSarvam = async (text) => {
    const res = await fetch('/api/sarvam-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker: 'shreya' }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Sarvam TTS failed: ${res.status}`);
    }
    const data = await res.json();
    const base64Audio = data?.audios?.[0];
    if (!base64Audio) throw new Error('Sarvam TTS returned no audio');

    const byteChars = atob(base64Audio);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'audio/wav' });
    await playAudioBlob(blob);
  };

  // Sends text to TTS and plays the result. English uses Groq's Orpheus;
  // Hindi uses Sarvam's Bulbul v3, since Orpheus only supports English/Arabic.
  const speakResponse = async (text) => {
    setIsSpeaking(true);
    shouldListenRef.current = false;
    haltRecording();

    try {
      if (language === 'hi') {
        await speakHindiViaSarvam(text);
      } else {
        const chunks = chunkTextForTTS(text);
        for (const chunk of chunks) {
          const response = await fetch('/api/groq-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `TTS request failed: ${response.status}`);
          }
          const blob = await response.blob();
          await playAudioBlob(blob);
        }
      }
    } catch (err) {
      console.error('TTS error:', err);
      const shortMsg = (err.message || '').slice(0, 120);
      setMicLog(`❌ TTS error: ${shortMsg}${err.message?.length > 120 ? '…' : ''}`);
    } finally {
      setIsSpeaking(false);
      // Only resume listening if the user actually had the mic on —
      // otherwise JARVIS speaking a typed-chat reply would silently
      // flip the mic back on even after the user turned it off.
      shouldListenRef.current = micEnabledRef.current;
    }
  };

  // Sends a recorded audio Blob to our backend, which forwards it to Groq
  // Whisper for transcription, then feeds the result into the normal chat
  // pipeline.
  const transcribeAndSend = async (blob, mimeType) => {
    setMicLog('📤 transcribing...');
    try {
      const lang = language === 'hi' ? 'hi' : 'en';
      const response = await fetch(`/api/groq-transcribe?language=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType || 'application/octet-stream' },
        body: blob,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Transcription failed: ${response.status}`);
      }
      const transcription = await response.json();
      const text = (transcription.text || '').trim();
      if (text.length > 1) {
        setMicLog(`📝 heard: "${text}"`);
        processWithGroq(text, 'voice');
      } else {
        setMicLog('⚠️ empty transcript, restarting mic...');
        restartIfEnabled();
      }
    } catch (err) {
      console.error('Whisper transcription error:', err);
      setMicLog(`❌ transcription failed: ${err.message}`);
      restartIfEnabled();
    }
  };

  const restartIfEnabled = () => {
    if (micEnabledRef.current && shouldListenRef.current) {
      setTimeout(() => startRecordingSession(), 250);
    } else {
      setIsListening(false);
    }
  };

  const handleRecordingStopped = (mimeType) => {
    const shouldSend = shouldSendAfterStopRef.current;
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];

    if (!shouldSend) {
      restartIfEnabled();
      return;
    }
    if (chunks.length === 0) {
      setMicLog('⚠️ no audio captured, restarting mic...');
      restartIfEnabled();
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    transcribeAndSend(blob, mimeType);
  };

  // Builds and starts a completely fresh recording session: gets a mic
  // stream, runs a lightweight volume-based voice-activity detector to
  // know when to stop, and records via MediaRecorder. This replaces the
  // old browser SpeechRecognition entirely — recording raw audio is far
  // more reliable across Android devices than the built-in recognition
  // engine, which could silently "listen" without ever capturing anything.
  const startRecordingSession = async () => {
    try {
      setMicLog('🔑 requesting mic permission...');
      // Explicit constraints instead of a bare {audio: true} — Android can
      // switch the whole phone into "communication mode" (the same audio
      // mode calling apps use, which changes what the volume buttons
      // control) when it detects call-style audio settings. This won't
      // eliminate that Android behavior entirely (it's an OS-level
      // decision outside what the web page controls), but it removes the
      // most common trigger.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      micStreamRef.current = stream;
      isAllowedRef.current = true;
      setMicAllowed(true);
      setIsListening(true);
      setMicLog('🎙️ recording — listening...');

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.fftSize);

      recordedChunksRef.current = [];
      hasDetectedSpeechRef.current = false;
      silenceStartRef.current = null;
      recordingStartRef.current = Date.now();
      shouldSendAfterStopRef.current = false;

      let mimeType = 'audio/webm;codecs=opus';
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        handleRecordingStopped(mimeType || recorder.mimeType || 'audio/webm');
      };
      recorder.start();

      const checkLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const dev = dataArray[i] - 128;
          sum += dev * dev;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const now = Date.now();
        const elapsed = now - recordingStartRef.current;

        if (rms > SILENCE_RMS_THRESHOLD) {
          if (!hasDetectedSpeechRef.current) {
            hasDetectedSpeechRef.current = true;
            setMicLog('🗣️ speech detected...');
          }
          silenceStartRef.current = null;
        } else if (hasDetectedSpeechRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > SILENCE_STOP_MS) {
            shouldSendAfterStopRef.current = true;
            try { mediaRecorderRef.current.stop(); } catch (e) {}
            stopMediaTracks();
            return;
          }
        }

        if (!hasDetectedSpeechRef.current && elapsed > NO_SPEECH_TIMEOUT_MS) {
          setMicLog('⏱️ no speech detected, restarting mic...');
          shouldSendAfterStopRef.current = false;
          try { mediaRecorderRef.current.stop(); } catch (e) {}
          stopMediaTracks();
          return;
        }

        if (elapsed > MAX_RECORDING_MS) {
          shouldSendAfterStopRef.current = true;
          try { mediaRecorderRef.current.stop(); } catch (e) {}
          stopMediaTracks();
          return;
        }

        vadRafRef.current = requestAnimationFrame(checkLevel);
      };
      vadRafRef.current = requestAnimationFrame(checkLevel);

    } catch (e) {
      console.warn('Microphone access error:', e);
      setMicLog(`❌ getUserMedia failed: ${e.name} - ${e.message}`);
      isAllowedRef.current = false;
      micEnabledRef.current = false;
      setMicAllowed(false);
      setIsListening(false);
      setLatestResponse('Microphone access denied. Click mic button to enable.');
    }
  };

  // Mic button toggles: tap once to turn on, tap again to turn off.
  const toggleMic = () => {
    if (micEnabledRef.current) {
      shouldListenRef.current = false;
      micEnabledRef.current = false;
      setIsListening(false);
      setMicLog('🔇 microphone turned off');
      haltRecording();
      return;
    }
    shouldListenRef.current = true;
    micEnabledRef.current = true;
    startRecordingSession();
  };

  // Automatic greeting on load: "Good Morning/Afternoon/Evening, Om.
  // How can I help you?" — spoken once via Orpheus, time-of-day aware.
  useEffect(() => {
    const buildGreeting = () => {
      const hour = new Date().getHours();
      let g = 'Good evening, sir.';
      if (hour < 12) g = 'Good morning, sir.';
      else if (hour < 17) g = 'Good afternoon, sir.';
      return `${g} How can I help you?`;
    };

    const timer = setTimeout(() => {
      const text = buildGreeting();
      setLatestResponse(text);
      speakResponse(text);
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { keys: ['gmail', 'open email', 'open mail'], url: 'https://mail.google.com', name: 'Gmail', androidPackage: 'com.google.android.gm' },
    { keys: ['whatsapp'], url: 'https://web.whatsapp.com', name: 'WhatsApp', androidPackage: 'com.whatsapp' },
    { keys: ['telegram'], url: 'https://web.telegram.org', name: 'Telegram', androidPackage: 'org.telegram.messenger' },
    { keys: ['instagram'], url: 'https://www.instagram.com', name: 'Instagram', androidPackage: 'com.instagram.android' },
    { keys: ['facebook'], url: 'https://www.facebook.com', name: 'Facebook', androidPackage: 'com.facebook.katana' },
    { keys: ['twitter', 'open x'], url: 'https://www.x.com', name: 'X', androidPackage: 'com.twitter.android' },
    { keys: ['linkedin'], url: 'https://www.linkedin.com', name: 'LinkedIn', androidPackage: 'com.linkedin.android' },
    { keys: ['tiktok'], url: 'https://www.tiktok.com', name: 'TikTok', androidPackage: 'com.zhiliaoapp.musically' },
    { keys: ['snapchat'], url: 'https://web.snapchat.com', name: 'Snapchat', androidPackage: 'com.snapchat.android' },
    { keys: ['pinterest'], url: 'https://www.pinterest.com', name: 'Pinterest', androidPackage: 'com.pinterest' },
    { keys: ['notion'], url: 'https://www.notion.so', name: 'Notion' },
    { keys: ['trello'], url: 'https://trello.com', name: 'Trello' },
    { keys: ['slack'], url: 'https://slack.com', name: 'Slack' },
    { keys: ['netflix'], url: 'https://www.netflix.com', name: 'Netflix', androidPackage: 'com.netflix.mediaclient' },
    { keys: ['prime video', 'amazon prime'], url: 'https://www.primevideo.com', name: 'Prime Video' },
    { keys: ['hotstar', 'disney plus', 'disney+'], url: 'https://www.hotstar.com', name: 'Hotstar' },
    { keys: ['twitch'], url: 'https://www.twitch.tv', name: 'Twitch' },
    { keys: ['amazon'], url: 'https://www.amazon.in', name: 'Amazon', androidPackage: 'com.amazon.mShop.android.shopping' },
    { keys: ['flipkart'], url: 'https://www.flipkart.com', name: 'Flipkart', androidPackage: 'com.flipkart.android' },
    { keys: ['chatgpt'], url: 'https://chat.openai.com', name: 'ChatGPT' },
    { keys: ['claude'], url: 'https://claude.ai', name: 'Claude' },
    { keys: ['stack overflow', 'stackoverflow'], url: 'https://stackoverflow.com', name: 'Stack Overflow' },
    { keys: ['spotify'], url: 'https://open.spotify.com', name: 'Spotify', androidPackage: 'com.spotify.music' },
    { keys: ['reddit'], url: 'https://www.reddit.com', name: 'Reddit', androidPackage: 'com.reddit.frontpage' },
    { keys: ['github'], url: 'https://www.github.com', name: 'GitHub' },
    { keys: ['youtube'], url: 'https://www.youtube.com', name: 'YouTube', androidPackage: 'com.google.android.youtube' },
    { keys: ['google'], url: 'https://www.google.com', name: 'Google' },
  ];

  // Android Chrome supports intent:// URLs that launch the actual native
  // app directly if it's installed, with an automatic fallback to the
  // normal web URL if it's not (or on other browsers). This is the real
  // fix for "why does it just open the browser instead of the app."
  const isAndroidChrome = () => {
    const ua = navigator.userAgent || '';
    return /Android/.test(ua) && /Chrome/.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua);
  };

  const openApp = (app) => {
    if (app.androidPackage && isAndroidChrome()) {
      const fallback = encodeURIComponent(app.url);
      const intentUrl = `intent://#Intent;package=${app.androidPackage};S.browser_fallback_url=${fallback};end`;
      window.location.href = intentUrl;
    } else {
      window.open(app.url, '_blank');
    }
  };

  const executeLocalAction = (userText) => {
    const text = userText.toLowerCase().trim();
    // Strip spaces and apostrophes so speech-to-text quirks like
    // "what's app" / "linked in" still match "whatsapp" / "linkedin".
    const normalize = (s) => s.replace(/['\u2019]/g, '').replace(/\s+/g, '');
    const normText = normalize(text);

    for (const app of APP_LINKS) {
      if (app.keys.some(key => normText.includes(normalize(key)))) {
        openApp(app);
        return `Opening ${app.name} for you, sir.`;
      }
    }

    if (text.startsWith('search ') || text.startsWith('google ')) {
      const q = text.replace(/^(search|google)\s+/i, '');
      window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
      return `Searching Google for ${q}, sir.`;
    }
    if (text.startsWith('play ')) {
      const song = text.replace(/^play\s+/i, '');
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`, '_blank');
      return `Searching YouTube for ${song}, sir.`;
    }

    return null;
  };

  const processWithGroq = async (userText, source = 'typed') => {
    if (!userText || userText.trim().length === 0) return;

    setInputText('');
    setIsProcessing(true);
    setLatestResponse('');
    setDebugError(null);
    setCommandCount(prev => prev + 1);
    shouldListenRef.current = false;
    haltRecording();

    // Check for local instant action commands first
    const actionResult = executeLocalAction(userText);
    if (actionResult) {
      setHistory(prev => [...prev, 
        { role: 'user', text: userText },
        { role: 'assistant', text: actionResult }
      ]);
      setLatestResponse(actionResult);
      logConversation({ userText, jarvisResponse: actionResult, source: 'action' });
      await speakResponse(actionResult);
      setIsProcessing(false);
      if (micEnabledRef.current) {
        shouldListenRef.current = true;
        if (isAllowedRef.current) startRecordingSession();
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
          content: `You are J.A.R.V.I.S., an advanced AI assistant in the style of Tony Stark's JARVIS — composed, precise, quietly witty, unfailingly courteous. Always address the user as "sir." Keep a calm, dry, understated sense of humor; be helpful and direct without being overly casual or gushing. Think a little before answering: for open-ended or interesting questions, don't just give the bare fact — offer a sharp, economical observation that adds value, the way JARVIS would. If asked who built, made, or created you, answer clearly and proudly that you were built by Om — don't be vague or evasive about it. Today's real date is ${dateString}, current time ${timeString}. Always treat this as the true current date, not any date you might otherwise assume from training. Use web search whenever a question depends on current, live, recent, or specific factual information (news, weather, prices, sports scores, people, places, releases, events, etc.) — prefer the latest available information over older knowledge. ${language === 'hi' ? 'Respond only in Hindi, written in Devanagari script (हिन्दी में जवाब दें), regardless of what script the user wrote in.' : 'Respond in English.'} Keep your answers brief, clear, and direct, suitable for speech synthesis. Do not use markdown or emojis.` 
        },
        ...history.slice(-6).map(msg => ({ role: msg.role, content: msg.text })),
        { role: 'user', content: userText }
      ];

      // Web search adds real latency, so only pay that cost when the
      // question actually seems to need current/live info.
      const needsLiveSearch = (text) => {
        const t = text.toLowerCase();
        const keywords = [
          'today', 'now', 'current', 'currently', 'latest', 'news', 'weather',
          'price', 'stock', 'score', 'forecast', 'temperature', 'live',
          'recent', 'this week', 'this year', 'who won', 'when is', 'when did',
          'release date', 'update', 'happening', 'right now',
        ];
        return keywords.some(k => t.includes(k));
      };

      // A call to our backend that gives up after a timeout instead of
      // hanging — this is what let a single flaky call silently eat both
      // the primary attempt AND the fallback attempt in the past.
      const callGroqWithTimeout = (model, ms = 9000) => {
        return Promise.race([
          fetch('/api/groq-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model, temperature: 0.6, max_tokens: 180 }),
          }).then(async (r) => {
            if (!r.ok) {
              const errData = await r.json().catch(() => ({}));
              throw new Error(errData.error || `Groq chat failed: ${r.status}`);
            }
            return r.json();
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${model} timed out`)), ms)),
        ]);
      };

      // NVIDIA's free-tier endpoint can be slower under load, and the
      // Ultra (550B) model is much larger than a typical fast model, so
      // it gets a generous timeout before falling back to Groq.
      const callNvidiaWithTimeout = (ms = 18000) => {
        return Promise.race([
          fetch('/api/nvidia-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, max_tokens: 220 }),
          }).then(async (r) => {
            if (!r.ok) {
              const errData = await r.json().catch(() => ({}));
              throw new Error(errData.error || `NVIDIA chat failed: ${r.status}`);
            }
            return r.json();
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('NVIDIA Nemotron timed out')), ms)),
        ]);
      };

      let completion;
      if (needsLiveSearch(userText)) {
        try {
          setMicLog('🌐 checking the web...');
          completion = await callGroqWithTimeout('groq/compound');
        } catch (searchErr) {
          console.warn('compound search failed, falling back to plain model:', searchErr);
          setMicLog('⚠️ web search unavailable, answering from memory...');
          completion = await callGroqWithTimeout('openai/gpt-oss-120b');
        }
      } else {
        try {
          setMicLog('🧠 thinking (Nemotron)...');
          completion = await callNvidiaWithTimeout();
        } catch (nvidiaErr) {
          console.warn('NVIDIA Nemotron failed, falling back to Groq:', nvidiaErr);
          setMicLog('⚠️ Nemotron unavailable, using backup brain...');
          completion = await callGroqWithTimeout('openai/gpt-oss-120b');
        }
      }

      let jarvisResponse = completion.choices[0]?.message?.content || "I couldn't process that, sir.";

      // The "respond in Hindi" instruction isn't always followed reliably,
      // especially when the transcribed input looks like Roman script.
      // Rather than just hoping, actually check: if Hindi mode is on but
      // the reply contains no Devanagari characters, it's still in
      // English — force a quick translation pass so what gets spoken is
      // guaranteed to actually be Hindi.
      const hasDevanagari = /[\u0900-\u097F]/.test(jarvisResponse);
      if (language === 'hi' && !hasDevanagari) {
        try {
          setMicLog('🔤 reply came back in English, translating to Hindi...');
          const translationRes = await fetch('/api/groq-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: 'Translate the following text into natural, conversational Hindi using Devanagari script. Reply with ONLY the Hindi translation, nothing else — no notes, no romanization.' },
                { role: 'user', content: jarvisResponse },
              ],
              model: 'openai/gpt-oss-120b',
              temperature: 0.3,
              max_tokens: 220,
            }),
          });
          const translation = await translationRes.json();
          const translated = translation.choices?.[0]?.message?.content;
          if (translated && /[\u0900-\u097F]/.test(translated)) {
            jarvisResponse = translated;
          }
        } catch (translateErr) {
          console.warn('Hindi translation fallback failed:', translateErr);
        }
      }

      setHistory(prev => [...prev, 
        { role: 'user', text: userText },
        { role: 'assistant', text: jarvisResponse }
      ]);
      setLatestResponse(jarvisResponse);
      logConversation({ userText, jarvisResponse, source });
      
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
      await speakResponse('My apologies, sir — I\'m having trouble connecting right now. Give me a moment and try again.');
    } finally {
      setIsProcessing(false);
      if (micEnabledRef.current) {
        shouldListenRef.current = true;
        if (isAllowedRef.current) startRecordingSession();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputText.trim()) {
      processWithGroq(inputText.trim());
    }
  };

  // Unmount cleanup only — recording lifecycle is fully handled by
  // startRecordingSession()/haltRecording() above.
  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setLatestResponse('Voice input unsupported on this browser.');
      setMicAllowed(false);
    }

    return () => {
      haltRecording();
      if (currentAudioRef.current) {
        try { currentAudioRef.current.pause(); } catch (e) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPlaceholderText = () => {
    if (!micAllowed) return "mic access denied — type command here & press enter...";
    if (isProcessing) return "analyzing request...";
    if (latestResponse) return latestResponse.toLowerCase();
    if (isListening) return "type a command or speak into mic...";
    return "initializing core systems...";
  };

  return (
    <div className="jarvis-terminal">
      {devMode && debugError && (
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
      {devMode && (
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
        maxHeight: '54px',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        textAlign: 'center'
      }}>
        MIC DEBUG: {micLog}
      </div>
      )}
      {/* Floating chat toggle button */}
      <motion.button
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsChatOpen(prev => !prev)}
        className="jarvis-chat-toggle-btn"
      >
        {isChatOpen ? <X size={26} /> : <MessageCircle size={26} />}
        {!isChatOpen && <span className="jarvis-pulse-ring"></span>}
      </motion.button>

      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="jarvis-chat-panel"
          >
            <div className="jarvis-chat-header">
              <div className="jarvis-chat-header-title">
                <span className={`jarvis-status-dot ${isSpeaking ? 'speaking' : isListening ? 'listening' : ''}`}></span>
                <h3>J.A.R.V.I.S.</h3>
              </div>
              <button className="jarvis-chat-close" onClick={() => setIsChatOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="jarvis-chat-messages">
              {history.length === 0 && (
                <div className="jarvis-chat-empty">Say something, or type a message below.</div>
              )}
              {history.map((msg, i) => (
                <div key={i} className={`jarvis-chat-bubble-row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                  <div className={`jarvis-chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="jarvis-chat-bubble-row assistant">
                  <div className="jarvis-chat-bubble assistant jarvis-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>

            <form
              className="jarvis-chat-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (inputText.trim()) processWithGroq(inputText.trim());
              }}
            >
              <button
                type="button"
                className={`jarvis-mic-btn ${micAllowed ? (isListening ? 'active' : '') : 'denied'}`}
                onClick={toggleMic}
                title={isListening ? "Microphone on — tap to turn off" : "Tap to turn on microphone"}
              >
                {micAllowed ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <input
                type="text"
                className="jarvis-chat-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholderText()}
              />
              <button
                type="submit"
                className="jarvis-chat-send-btn"
                disabled={!inputText.trim() || isProcessing}
                title="Send"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
