import { useState, useEffect, useRef, useCallback } from 'react';
import { NarExtractor } from '../services/narExtractor';
import type { NarMascotData } from '../services/narExtractor';
import { ShellParser } from '../services/shellParser';
import type { ShellData } from '../services/shellParser';
import { ShioriRunner } from '../services/shioriRunner';
import type { GhostMetadata } from '../services/shioriRunner';
import { SakuraScriptParser } from '../services/sakuraScriptParser';
import type { SakuraPlayerState } from '../services/sakuraScriptParser';
import type { DialogueLine } from '../types';

export function useUkagaka(
  userName: string,
  banterInterval: number,
  onLineComplete?: (line: DialogueLine) => void,
  translateFn?: (scope: number, text: string) => Promise<string | null>
) {
  const [activeUkagaka, setActiveUkagaka] = useState<NarMascotData | null>(null);
  const [shellData, setShellData] = useState<ShellData | null>(null);
  const [runner, setRunner] = useState<ShioriRunner | null>(null);
  const [ghostMetadata, setGhostMetadata] = useState<GhostMetadata | null>(null);
  
  const [playerState, setPlayerState] = useState<SakuraPlayerState>({
    scope: 0,
    surfaces: { 0: 0, 1: 10 },
    texts: { 0: '', 1: '' },
    choices: { 0: [], 1: [] },
    isFinished: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const secondTimerRef = useRef<number | null>(null);
  
  // Track state in refs for timer closure access
  const runnerRef = useRef<ShioriRunner | null>(null);
  const playerStateRef = useRef<SakuraPlayerState>(playerState);
  const banterIntervalRef = useRef<number>(banterInterval);
  
  useEffect(() => {
    runnerRef.current = runner;
  }, [runner]);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  const translateFnRef = useRef(translateFn);
  useEffect(() => {
    translateFnRef.current = translateFn;
  }, [translateFn]);


  // Clean up and release Object URLs
  const unloadUkagaka = useCallback(() => {
    if (secondTimerRef.current) {
      window.clearInterval(secondTimerRef.current);
      secondTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    NarExtractor.clearActiveAssets();
    setActiveUkagaka(null);
    setShellData(null);
    setRunner(null);
    setGhostMetadata(null);
    setPlayerState({
      scope: 0,
      surfaces: { 0: 0, 1: 10 },
      texts: { 0: '', 1: '' },
      choices: { 0: [], 1: [] },
      isFinished: true,
    });
    setError(null);
  }, []);

  const playScript = useCallback(async (script: string) => {
    if (!script) return;

    // Abort previous script play to start new one immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const tokens = SakuraScriptParser.tokenize(script);

    const lastFlushedTexts = { 0: '', 1: '' };
    const flushTextToHistory = (scope: number, currentText: string) => {
      // If the text has been cleared in the parser, reset our flushed anchor
      if (currentText.length < lastFlushedTexts[scope as 0 | 1].length) {
        lastFlushedTexts[scope as 0 | 1] = '';
      }

      const anchor = lastFlushedTexts[scope as 0 | 1];
      let newText = currentText;
      if (currentText.startsWith(anchor)) {
        newText = currentText.substring(anchor.length);
      }

      const trimmed = newText.trim();
      if (trimmed && onLineComplete) {
        const sakuraName = runnerRef.current?.getMetadata().sakuraName || 'Sakura';
        const keroName = runnerRef.current?.getMetadata().keroName || 'Kero';
        onLineComplete({
          character: scope === 0 ? 'strawberry' : 'choco',
          speakerName: scope === 0 ? sakuraName : keroName,
          text: trimmed,
          emotion: 'calm',
          timestamp: Date.now(),
        });
        lastFlushedTexts[scope as 0 | 1] = currentText;
      }
    };

    let activeScope = 0;
    const latestTexts = { 0: '', 1: '' };
    
    try {
      await SakuraScriptParser.play(
        tokens,
        (state) => {
          // Flush previous scope text if scope changes
          if (state.scope !== activeScope) {
            flushTextToHistory(activeScope, latestTexts[activeScope as 0 | 1]);
            activeScope = state.scope;
          }

          // Flush text before a clear command resets it
          if (state.texts[state.scope] === '' && latestTexts[state.scope as 0 | 1] !== '') {
            flushTextToHistory(state.scope, latestTexts[state.scope as 0 | 1]);
          }

          latestTexts[0] = state.texts[0];
          latestTexts[1] = state.texts[1];

          setPlayerState(state);
        },
        (_choiceId) => {
          // Choice click handler
        },
        35, // Typing speed (ms per char)
        abortController.signal,
        translateFnRef.current,
        2500 // reading delay in ms
      );

      // Final flush at end of script
      flushTextToHistory(0, latestTexts[0]);
      flushTextToHistory(1, latestTexts[1]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Error playing SakuraScript:', e);
      }
    }
  }, [onLineComplete]);

  const triggerEvent = useCallback((event: string, refParts: string[] = []) => {
    const activeRunner = runnerRef.current;
    if (!activeRunner) return;

    const script = activeRunner.trigger(event, refParts);
    if (script) {
      playScript(script);
    }
  }, [playScript]);

  const loadUkagaka = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const mascotData = await NarExtractor.extract(buffer);
      const parsedShell = ShellParser.parse(mascotData.files);
      const parsedRunner = new ShioriRunner(mascotData.files, userName, mascotData.metadata.charset);

      setActiveUkagaka(mascotData);
      setShellData(parsedShell);
      setRunner(parsedRunner);
      setGhostMetadata(parsedRunner.getMetadata());

      // Start the tick timer
      if (secondTimerRef.current) {
        window.clearInterval(secondTimerRef.current);
      }
      
      let secondsCount = 0;
      secondTimerRef.current = window.setInterval(() => {
        secondsCount++;
        const activeRunner = runnerRef.current;
        if (activeRunner && playerStateRef.current.isFinished) {
          // Trigger random talk at configured banter interval
          const currentInterval = banterIntervalRef.current;
          if (currentInterval > 0 && secondsCount % currentInterval === 0) {
            const script = activeRunner.trigger('OnRandomTalk');
            if (script) {
              playScript(script);
              return;
            }
          }

          // Trigger standard second change event checks
          const script = activeRunner.trigger('OnSecondChange', [String(secondsCount)]);
          if (script) {
            playScript(script);
          }
        }
      }, 1000);

      // Trigger Boot event
      const bootScript = parsedRunner.trigger('OnBoot');
      playScript(bootScript);

    } catch (e: any) {
      console.error('Failed to load Ukagaka:', e);
      setError(e.message || 'Failed to extract NAR file.');
      unloadUkagaka();
    } finally {
      setIsLoading(false);
    }
  }, [userName, playScript, unloadUkagaka]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (secondTimerRef.current) {
        window.clearInterval(secondTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    activeUkagaka,
    shellData,
    ghostMetadata,
    playerState,
    isLoading,
    error,
    loadUkagaka,
    unloadUkagaka,
    triggerEvent,
  };
}
