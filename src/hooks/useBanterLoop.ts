import { useState, useEffect, useRef, useCallback } from 'react';
import type { DialogueLine, MockEventType, AppSettings } from '../types';
import { StorageService } from '../services/storage';
import { GeminiService } from '../services/gemini';

export function useBanterLoop() {
  // Config state
  const [settings, setSettings] = useState<AppSettings>(() => ({
    apiKey: StorageService.getApiKey(),
    banterInterval: StorageService.getBanterInterval(),
    userName: StorageService.getUserName(),
  }));

  // History & dialogue state
  const [chatHistory, setChatHistory] = useState<DialogueLine[]>(() => StorageService.getChatHistory());
  const [currentDialogue, setCurrentDialogue] = useState<DialogueLine[]>([]);
  
  // Status states
  const [isLoading, setIsLoading] = useState(false);
  const [isBanterPlaying, setIsBanterPlaying] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // References to keep timer and lock state up to date
  const timerRef = useRef<number | null>(null);
  const isBanterPlayingRef = useRef(false);
  const isLoadingRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    isBanterPlayingRef.current = isBanterPlaying;
  }, [isBanterPlaying]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Save history helper
  const addLinesToHistory = useCallback((lines: DialogueLine[]) => {
    setChatHistory((prev) => {
      // Add unique timestamps if not already present
      const now = Date.now();
      const updatedLines = lines.map((line, i) => ({
        ...line,
        timestamp: line.timestamp || (now + i),
      }));
      const nextHistory = [...prev, ...updatedLines];
      StorageService.setChatHistory(nextHistory);
      return nextHistory;
    });
  }, []);

  // Play a dialogue sequence
  const playDialogue = useCallback((dialogue: DialogueLine[]) => {
    if (dialogue.length === 0) return;
    setIsBanterPlaying(true);
    setCurrentDialogue(dialogue);
  }, []);

  // Execute dialogue trigger (either from LLM or local mock)
  const triggerBanter = useCallback(async (event: MockEventType) => {
    // Prevent double triggers
    if (isLoadingRef.current || isBanterPlayingRef.current) return;

    setIsLoading(true);
    setApiError(null);
    try {
      const dialogue = await GeminiService.handleEvent(event);
      playDialogue(dialogue);
    } catch (err: any) {
      console.error('Failed to trigger dialogue event:', err);
      setApiError(err.message || 'Gemini API Error');
    } finally {
      setIsLoading(false);
    }
  }, [playDialogue]);

  // Setup the self-healing interval timer
  const resetBanterTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (settings.banterInterval <= 0) {
      console.log('[BanterLoop] Interval is disabled.');
      return;
    }

    console.log(`[BanterLoop] Timer scheduled in ${settings.banterInterval} seconds.`);
    timerRef.current = window.setInterval(() => {
      // Only fire if not busy
      if (!isBanterPlayingRef.current && !isLoadingRef.current) {
        console.log('[BanterLoop] Auto-triggering random dialogue.');
        triggerBanter('random');
      }
    }, settings.banterInterval * 1000);
  }, [settings.banterInterval, triggerBanter]);

  // Restart the timer when interval settings or active states change
  useEffect(() => {
    resetBanterTimer();
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [resetBanterTimer]);

  // Action: User sending a text message
  const sendMessage = useCallback(async (text: string) => {
    if (isLoading) return;

    setIsLoading(true);
    setApiError(null);

    // Stop current play sequence immediately to make room for user response
    setIsBanterPlaying(false);
    setCurrentDialogue([]);

    // 1. Immediately append user's line to history
    const userLine: DialogueLine = {
      character: 'user',
      text,
      emotion: 'calm',
      timestamp: Date.now(),
    };
    setChatHistory((prev) => {
      const nextHistory = [...prev, userLine];
      StorageService.setChatHistory(nextHistory);
      return nextHistory;
    });

    // 2. Fetch characters' reactions
    try {
      const dialogue = await GeminiService.handleUserMessage(text);
      playDialogue(dialogue);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setApiError(err.message || 'Gemini API Error');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, playDialogue]);

  // Action: Touch gesture trigger
  const triggerTouch = useCallback(async (character: 'strawberry' | 'choco', gesture: 'tap' | 'poke' | 'pet') => {
    const eventName = `touch_${character}_${gesture}` as MockEventType;
    await triggerBanter(eventName);
  }, [triggerBanter]);

  // Action: Special events like low battery
  const triggerSpecialEvent = useCallback(async (event: 'battery_low' | 'idle_3hours') => {
    await triggerBanter(event);
  }, [triggerBanter]);

  // Settings modification
  const saveSettings = useCallback((apiKey: string, banterInterval: number, userName: string) => {
    StorageService.setApiKey(apiKey);
    StorageService.setBanterInterval(banterInterval);
    StorageService.setUserName(userName);
    setSettings({ apiKey, banterInterval, userName });
    setApiError(null);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    StorageService.clearChatHistory();
    setChatHistory([]);
  }, []);

  // Banter playback completed callbacks
  const onBanterComplete = useCallback(() => {
    setIsBanterPlaying(false);
    setCurrentDialogue([]);
    // Reset timer to ensure we wait the full duration from *now* (after banter finished)
    resetBanterTimer();
  }, [resetBanterTimer]);

  const onBanterLineComplete = useCallback((line: DialogueLine) => {
    addLinesToHistory([line]);
  }, [addLinesToHistory]);

  return {
    settings,
    chatHistory,
    currentDialogue,
    isLoading,
    isBanterPlaying,
    apiError,
    setApiError,
    sendMessage,
    triggerTouch,
    triggerSpecialEvent,
    saveSettings,
    clearHistory,
    onBanterComplete,
    onBanterLineComplete,
  };
}
