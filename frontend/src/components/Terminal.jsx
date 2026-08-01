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
  const [micAllowed, setMicAllowed] = useState(true);
  
  const recognitionRef = useRef(null);
  const isAllowedRef = useRef(true);
  const shouldListenRef = useRef(true);
  const silenceTimerRef = useRef(null);
  const currentInterimRef = useRef('');

  // Report status changes to parent
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange({
        isListening,
        isProcessing,
        isSpeaking,
        micAllowed: micAllowed
      });
    }
  }, [isListening, isProcessing, isSpeaking, micAllowed, onStatusChange]);

  // Request Microphone Access manually via user click
  const requestMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      isAllowedRef.current = true;
      setMicAllowed(true);
      shouldListenRef.current = true;
      setLatestResponse('Microphone access granted.');

      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    } catch (e) {
      console.warn("Microphone access denied:", e);
      isAllowedRef.current = false;
      setMicAllowed(false);
      setLatestResponse('Microphone access denied. Click mic button to enable.');
    }
  };

  // Pre-fetch voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const speakResponse = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      const voices = window.speechSynthesis.getVoices();
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
      
      utterance.onstart = () => {
        setIsSpeaking(true);
        shouldListenRef.current = false;
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (e) {}
        }
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
        shouldListenRef.current = true;
        resolve();
      };
      
      utterance.onerror = () => {
        setIsSpeaking(false);
        shouldListenRef.current = true;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  // Action executor for commands like "open youtube", "search ...", etc.
  const executeLocalAction = (userText) => {
    const text = userText.toLowerCase().trim();

    if (text.includes('open youtube') || text.includes('youtube')) {
      window.open('https://www.youtube.com', '_blank');
      return 'Opening YouTube for you, sir.';
    }
    if (text.includes('open google') || text.includes('google')) {
      window.open('https://www.google.com', '_blank');
      return 'Opening Google, sir.';
    }
    if (text.includes('open github') || text.includes('github')) {
      window.open('https://www.github.com', '_blank');
      return 'Opening GitHub, sir.';
    }
    if (text.includes('open spotify') || text.includes('spotify')) {
      window.open('https://open.spotify.com', '_blank');
      return 'Opening Spotify, sir.';
    }
    if (text.includes('open reddit') || text.includes('reddit')) {
      window.open('https://www.reddit.com', '_blank');
      return 'Opening Reddit, sir.';
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

  const processWithGroq = async (userText) => {
    if (!userText || userText.trim().length === 0) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    currentInterimRef.current = '';
    setInterimText('');
    setInputText('');

    setIsProcessing(true);
    setLatestResponse('');
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
      shouldListenRef.current = true;
      try {
        if (recognitionRef.current && isAllowedRef.current) recognitionRef.current.start();
      } catch (e) {}
      return;
    }

    try {
      const messages = [
        { 
          role: 'system', 
          content: 'You are J.A.R.V.I.S., a highly advanced AI assistant. Keep your answers brief, clear, and direct, suitable for speech synthesis. Do not use markdown or emojis.' 
        },
        ...history.slice(-6).map(msg => ({ role: msg.role, content: msg.text })),
        { role: 'user', content: userText }
      ];

      const completion = await groq.chat.completions.create({
        messages: messages,
        model: 'llama-3.1-8b-instant',
        temperature: 0.6,
        max_tokens: 100,
      });

      const jarvisResponse = completion.choices[0]?.message?.content || "I couldn't process that, sir.";
      
      setHistory(prev => [...prev, 
        { role: 'user', text: userText },
        { role: 'assistant', text: jarvisResponse }
      ]);
      setLatestResponse(jarvisResponse);
      
      await speakResponse(jarvisResponse);

    } catch (error) {
      console.error("Groq Error:", error);
      const errorMsg = "System connection error.";
      setLatestResponse(errorMsg);
      await speakResponse(errorMsg);
    } finally {
      setIsProcessing(false);
      shouldListenRef.current = true;
      try {
        if (recognitionRef.current && isAllowedRef.current) recognitionRef.current.start();
      } catch (e) {}
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputText.trim()) {
      processWithGroq(inputText.trim());
    }
  };

  useEffect(() => {
    if (!SpeechRecognition) {
      setLatestResponse('Speech recognition unsupported.');
      setMicAllowed(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      isAllowedRef.current = true;
      setMicAllowed(true);
    };

    recognition.onresult = (event) => {
      if (!shouldListenRef.current) return;

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

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      if (activeText.length > 2) {
        silenceTimerRef.current = setTimeout(() => {
          if (currentInterimRef.current && shouldListenRef.current && !isProcessing && !isSpeaking) {
            const textToSend = currentInterimRef.current;
            currentInterimRef.current = '';
            processWithGroq(textToSend);
          }
        }, 1200);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        isAllowedRef.current = false;
        setMicAllowed(false);
        setLatestResponse('Microphone access denied. Click 🎙️ to allow.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      
      if (isAllowedRef.current && shouldListenRef.current) {
        setTimeout(() => {
          try {
            if (shouldListenRef.current) recognition.start();
          } catch (e) {}
        }, 300);
      }
    };

    setTimeout(() => {
      try {
        if (shouldListenRef.current) recognition.start();
      } catch (e) {}
    }, 500);

    return () => {
      recognition.onend = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognition.abort(); } catch (e) {}
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
      <div className="jarvis-terminal-bar">
        <button 
          className={`jarvis-mic-btn ${micAllowed ? (isListening ? 'active' : '') : 'denied'}`}
          onClick={requestMicAccess}
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
