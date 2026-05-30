import React, { useState } from 'react';
import { useBanterLoop } from './hooks/useBanterLoop';
import { useWakeLock } from './hooks/useWakeLock';
import { WidgetSimulator } from './components/WidgetSimulator';
import { ChatHistory } from './components/ChatHistory';
import { SettingsModal } from './components/SettingsModal';
import { Send, Settings as SettingsIcon, AlertCircle, ShieldAlert } from 'lucide-react';
import { translations } from './data/translations';
import { useUkagaka } from './hooks/useUkagaka';
import { UkagakaRenderer } from './components/UkagakaRenderer';
import { SpeechBubble } from './components/SpeechBubble';
import { GeminiService } from './services/gemini';
import { StorageService } from './services/storage';

export default function App() {
  useWakeLock();

  const {
    settings,
    chatHistory,
    currentDialogue,
    isLoading,
    apiError,
    setApiError,
    sendMessage,
    triggerTouch,
    saveSettings,
    clearHistory,
    onBanterComplete,
    onBanterLineComplete,
    setIsUkagakaActive,
    updateChatLineTranslation,
  } = useBanterLoop();

  const handleTranslateBubbleRef = React.useRef<((scopeId: number, text: string) => Promise<string | null>) | null>(null);

  const {
    activeUkagaka,
    shellData,
    ghostMetadata,
    playerState,
    isLoading: isUkagakaLoading,
    isRestoring,
    error: ukagakaError,
    loadUkagaka,
    unloadUkagaka,
    triggerEvent: triggerUkagakaEvent,
  } = useUkagaka(
    settings.userName,
    settings.banterInterval,
    onBanterLineComplete,
    React.useCallback((scope: number, text: string) => {
      return handleTranslateBubbleRef.current ? handleTranslateBubbleRef.current(scope, text) : Promise.resolve(null);
    }, [])
  );

  // Translation state for the current active speech bubbles (scopeId -> translated text)
  const [bubbleTranslations, setBubbleTranslations] = useState<Record<number, string>>({});
  const [isTranslatingBubble, setIsTranslatingBubble] = useState<Record<number, boolean>>({});

  // History line index currently translating
  const [translatingHistoryIndex, setTranslatingHistoryIndex] = useState<number | null>(null);

  // Reset bubble translations whenever player state texts change
  const lastBubbleTextsRef = React.useRef({ 0: '', 1: '' });

  React.useEffect(() => {
    const textsChanged =
      playerState.texts[0] !== lastBubbleTextsRef.current[0] ||
      playerState.texts[1] !== lastBubbleTextsRef.current[1];

    if (textsChanged) {
      setBubbleTranslations({});
      setIsTranslatingBubble({});
      lastBubbleTextsRef.current = {
        0: playerState.texts[0],
        1: playerState.texts[1],
      };
    }
  }, [playerState.texts]);

  // Auto-translate active speech bubbles when player finishes typing
  React.useEffect(() => {
    if (!settings.autoTranslate || !playerState.isFinished) return;

    const targetLang = settings.language || 'ko';
    const activeGhostName = activeUkagaka?.metadata.name || '';
    const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/;

    const translateBubbleIfNeeded = async (scopeId: number) => {
      const text = playerState.texts[scopeId]?.trim();
      if (!text || bubbleTranslations[scopeId] || isTranslatingBubble[scopeId]) return;
      if (!hasJapanese.test(text)) return;

      const cached = StorageService.getTranslation(text, targetLang);
      if (cached) {
        const cleaned = GeminiService.stripSakuraScript(cached);
        setBubbleTranslations((prev) => ({ ...prev, [scopeId]: cleaned }));
        return;
      }

      const config = activeGhostName ? StorageService.getGhostConfig(activeGhostName) : { personality: '', description: '' };
      const speakerName = scopeId === 0
        ? (ghostMetadata?.sakuraName || 'Sakura')
        : (ghostMetadata?.keroName || 'Kero');

      setIsTranslatingBubble((prev) => ({ ...prev, [scopeId]: true }));
      try {
        const translated = await GeminiService.translateDialogue(
          text,
          targetLang,
          speakerName,
          activeGhostName,
          config.personality,
          config.description
        );
        StorageService.setTranslation(text, targetLang, translated);
        setBubbleTranslations((prev) => ({ ...prev, [scopeId]: translated }));
      } catch (err) {
        console.error(`Auto-translate active bubble ${scopeId} error:`, err);
      } finally {
        setIsTranslatingBubble((prev) => ({ ...prev, [scopeId]: false }));
      }
    };

    translateBubbleIfNeeded(0);
    translateBubbleIfNeeded(1);
  }, [playerState.isFinished, playerState.texts, settings.autoTranslate, settings.language, activeUkagaka, ghostMetadata, bubbleTranslations, isTranslatingBubble]);

  // Auto-translate last few entries in history log
  React.useEffect(() => {
    if (!settings.autoTranslate) return;
    if (chatHistory.length === 0) return;

    const targetLang = settings.language || 'ko';
    const activeGhostName = activeUkagaka?.metadata.name || '';
    const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/;

    // Check last 5 entries to see if they need translation
    const startIndex = Math.max(0, chatHistory.length - 5);

    for (let idx = startIndex; idx < chatHistory.length; idx++) {
      const line = chatHistory[idx];
      if (line.character === 'user' || line.translatedText) continue;
      if (!hasJapanese.test(line.text)) continue;

      const targetIdx = idx;
      const textToTranslate = line.text;
      const speakerName = line.speakerName;

      const runAutoTranslate = async () => {
        // Check cache first
        const cached = StorageService.getTranslation(textToTranslate, targetLang);
        if (cached) {
          const cleaned = GeminiService.stripSakuraScript(cached);
          updateChatLineTranslation(targetIdx, cleaned);
          return;
        }

        const config = activeGhostName ? StorageService.getGhostConfig(activeGhostName) : { personality: '', description: '' };
        try {
          const translated = await GeminiService.translateDialogue(
            textToTranslate,
            targetLang,
            speakerName,
            activeGhostName,
            config.personality,
            config.description
          );

          StorageService.setTranslation(textToTranslate, targetLang, translated);
          updateChatLineTranslation(targetIdx, translated);
        } catch (err: any) {
          console.error('Auto translation error:', err);
        }
      };

      runAutoTranslate();
    }
  }, [chatHistory, settings.autoTranslate, settings.language, activeUkagaka]);

  const handleTranslateBubble = async (scopeId: number, text: string): Promise<string | null> => {
    if (!text) return null;

    const targetLang = settings.language || 'ko';
    const activeGhostName = activeUkagaka?.metadata.name || '';

    // Check cache first
    const cached = StorageService.getTranslation(text, targetLang);
    if (cached) {
      const cleaned = GeminiService.stripSakuraScript(cached);
      setBubbleTranslations((prev) => ({ ...prev, [scopeId]: cleaned }));
      return cleaned;
    }

    const config = activeGhostName ? StorageService.getGhostConfig(activeGhostName) : { personality: '', description: '' };
    const speakerName = scopeId === 0
      ? (ghostMetadata?.sakuraName || 'Sakura')
      : (ghostMetadata?.keroName || 'Kero');

    setIsTranslatingBubble((prev) => ({ ...prev, [scopeId]: true }));
    try {
      const translated = await GeminiService.translateDialogue(
        text,
        targetLang,
        speakerName,
        activeGhostName,
        config.personality,
        config.description
      );

      StorageService.setTranslation(text, targetLang, translated);
      setBubbleTranslations((prev) => ({ ...prev, [scopeId]: translated }));
      return translated;
    } catch (err: any) {
      console.error('Bubble translation error:', err);
      setApiError(err.message || 'Translation failed');
      return null;
    } finally {
      setIsTranslatingBubble((prev) => ({ ...prev, [scopeId]: false }));
    }
  };

  handleTranslateBubbleRef.current = handleTranslateBubble;

  const handleTranslateHistoryLine = async (index: number) => {
    const line = chatHistory[index];
    if (!line || line.translatedText || translatingHistoryIndex !== null) return;

    const text = line.text;
    const targetLang = settings.language || 'ko';
    const activeGhostName = activeUkagaka?.metadata.name || '';

    // Check cache first
    const cached = StorageService.getTranslation(text, targetLang);
    if (cached) {
      const cleaned = GeminiService.stripSakuraScript(cached);
      updateChatLineTranslation(index, cleaned);
      return;
    }

    const config = activeGhostName ? StorageService.getGhostConfig(activeGhostName) : { personality: '', description: '' };

    setTranslatingHistoryIndex(index);
    try {
      const translated = await GeminiService.translateDialogue(
        text,
        targetLang,
        line.speakerName,
        activeGhostName,
        config.personality,
        config.description
      );

      StorageService.setTranslation(text, targetLang, translated);
      updateChatLineTranslation(index, translated);
    } catch (err: any) {
      console.error('History line translation error:', err);
      setApiError(err.message || 'Translation failed');
    } finally {
      setTranslatingHistoryIndex(null);
    }
  };

  React.useEffect(() => {
    setIsUkagakaActive(!!activeUkagaka);
  }, [activeUkagaka, setIsUkagakaActive]);

  const [messageInput, setMessageInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const t = translations[settings.language || 'ko'];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    if (activeUkagaka) {
      // Append user text to chat log
      onBanterLineComplete({
        character: 'user',
        text,
        emotion: 'calm',
        timestamp: Date.now(),
      });
      triggerUkagakaEvent('OnUserInput', [text]);
      setMessageInput('');
    } else {
      if (isLoading) return;
      sendMessage(text);
      setMessageInput('');
    }
  };

  const handleSaveSettings = (
    apiKey: string,
    banterInterval: number,
    userName: string,
    maxHistoryLimit: number,
    language: 'ko' | 'en',
    autoTranslate: boolean,
    translationDisplayMode: 'both' | 'translationOnly'
  ) => {
    saveSettings(apiKey, banterInterval, userName, maxHistoryLimit, language, autoTranslate, translationDisplayMode);
  };

  // Disable text entry ONLY when API request or Ukagaka processing is pending
  const inputDisabled = isRestoring || (activeUkagaka ? (isUkagakaLoading || !playerState.isFinished) : isLoading);

  return (
    <div className="app-viewport">
      {/* Visual background glows */}
      <div className="bg-glow-blob bg-glow-strawberry" />
      <div className="bg-glow-blob bg-glow-choco" />
      <div className="bg-glow-blob bg-glow-center" />

      {/* Simulated Device Frame Container */}
      <div className="phone-frame">
        
        {/* Header */}
        <header className="phone-header">
          <div className="brand-section">
            <h1 className="app-title">{t.appTitle}</h1>
            <span className="app-subtitle">{t.appSubtitle}</span>
          </div>
          <button
            className="btn-settings"
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.openSettings}
          >
            <SettingsIcon size={18} />
          </button>
        </header>

        {/* Scrollable Viewport (Logs & Notifications) */}
        <main className="phone-content">
          {/* API Error Notification */}
          {apiError && (
            <div className="status-banner error">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <AlertCircle size={14} style={{ marginRight: '6px' }} />
                {t.error}: {apiError}
              </span>
              <button className="banner-link" onClick={() => setApiError(null)}>
                {t.close}
              </button>
            </div>
          )}

          {/* Ukagaka Load Error Notification */}
          {ukagakaError && (
            <div className="status-banner error">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <AlertCircle size={14} style={{ marginRight: '6px' }} />
                {t.error}: {ukagakaError}
              </span>
              <button className="banner-link" onClick={unloadUkagaka}>
                {t.close}
              </button>
            </div>
          )}

          {/* Key Missing Warning (Mock dialogue mode indicator) */}
          {!settings.apiKey && !apiError && !activeUkagaka && (
            <div className="status-banner no-key">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <ShieldAlert size={14} style={{ marginRight: '6px' }} />
                {t.noApiKey}
              </span>
              <button className="banner-link" onClick={() => setIsSettingsOpen(true)}>
                {t.enterKey}
              </button>
            </div>
          )}

          {/* Chat History Logs */}
          <ChatHistory
            history={chatHistory}
            onClear={clearHistory}
            userName={settings.userName}
            language={settings.language}
            emptyMessage={activeUkagaka ? t.emptyHistoryUkagaka : undefined}
            isUkagakaActive={!!activeUkagaka}
            onTranslateLine={handleTranslateHistoryLine}
            translatingIndex={translatingHistoryIndex ?? undefined}
            translationDisplayMode={settings.translationDisplayMode}
          />
        </main>

        {/* Mascot Speech Simulator Layer (Floating inside overlay above footer) */}
        <div className="character-fixed-overlay">
          {isRestoring ? null : activeUkagaka && shellData ? (
            <div className="widget-container">
              <div className="widget-frame" style={{ width: '100%' }}>
                <div className="characters-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', width: '100%', gap: '16px' }}>
                  {/* Scope 0 (Main mascot) */}
                  <div className="character-slot strawberry-slot" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
                    <div className="bubble-container" style={{ minHeight: '60px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', width: '100%', marginBottom: '4px' }}>
                      <SpeechBubble
                        text={playerState.texts[0]}
                        emotion="calm"
                        isActive={playerState.scope === 0 && !playerState.isFinished}
                        side="left"
                        onTranslate={() => handleTranslateBubble(0, playerState.texts[0])}
                        translatedText={bubbleTranslations[0]}
                        isTranslating={isTranslatingBubble[0]}
                        translationDisplayMode={settings.translationDisplayMode}
                      >
                        {playerState.choices[0].length > 0 && (
                          <div className="choice-container" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            {playerState.choices[0].map((choice, idx) => (
                              <button
                                key={idx}
                                onClick={() => triggerUkagakaEvent('OnChoiceSelect', [choice.id])}
                                className="choice-button"
                                style={{
                                  textAlign: 'left',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  color: '#e9d5ff',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  transition: 'background 0.2s',
                                  width: '100%',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </SpeechBubble>
                    </div>
                    <UkagakaRenderer
                      files={activeUkagaka.files}
                      surfaceId={playerState.surfaces[0] ?? 0}
                      surfaces={shellData.surfaces}
                      isTalking={playerState.scope === 0 && !playerState.isFinished}
                      onCollisionClick={(label, isDbl) => {
                        triggerUkagakaEvent(isDbl ? 'OnMouseDoubleClick' : 'OnMouseClick', ['0', '0', '0', label]);
                      }}
                      onCollisionMouseMove={(label) => {
                        triggerUkagakaEvent('OnMouseMove', ['0', '0', '0', label]);
                      }}
                      characterScope={0}
                    />
                    <div className="name-tag" style={{ fontSize: '11px', color: '#a78bfa', marginTop: '4px', background: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                      {ghostMetadata?.sakuraName || 'Sakura'}
                    </div>
                  </div>

                  {/* Scope 1 (Partner mascot) */}
                  {(ghostMetadata?.keroName || shellData.descript['kero.name'] || shellData.surfaces[10] || Object.keys(activeUkagaka.files).some(p => p.toLowerCase().includes('kero') || p.toLowerCase().includes('surface10.png'))) && (
                    <div className="character-slot choco-slot" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
                      <div className="bubble-container" style={{ minHeight: '60px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', width: '100%', marginBottom: '4px' }}>
                        <SpeechBubble
                          text={playerState.texts[1]}
                          emotion="calm"
                          isActive={playerState.scope === 1 && !playerState.isFinished}
                          side="right"
                          onTranslate={() => handleTranslateBubble(1, playerState.texts[1])}
                          translatedText={bubbleTranslations[1]}
                          isTranslating={isTranslatingBubble[1]}
                          translationDisplayMode={settings.translationDisplayMode}
                        >
                          {playerState.choices[1].length > 0 && (
                            <div className="choice-container" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                              {playerState.choices[1].map((choice, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => triggerUkagakaEvent('OnChoiceSelect', [choice.id])}
                                  className="choice-button"
                                  style={{
                                    textAlign: 'left',
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    color: '#e9d5ff',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    width: '100%',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'}
                                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                                >
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </SpeechBubble>
                      </div>
                      <UkagakaRenderer
                        files={activeUkagaka.files}
                        surfaceId={playerState.surfaces[1] ?? 10}
                        surfaces={shellData.surfaces}
                        isTalking={playerState.scope === 1 && !playerState.isFinished}
                        onCollisionClick={(label, isDbl) => {
                          triggerUkagakaEvent(isDbl ? 'OnMouseDoubleClick' : 'OnMouseClick', ['0', '0', '1', label]);
                        }}
                        onCollisionMouseMove={(label) => {
                          triggerUkagakaEvent('OnMouseMove', ['0', '0', '1', label]);
                        }}
                        characterScope={1}
                      />
                      <div className="name-tag" style={{ fontSize: '11px', color: '#a78bfa', marginTop: '4px', background: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {ghostMetadata?.keroName || 'Kero'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <WidgetSimulator
              lines={currentDialogue}
              isLoading={isLoading}
              onComplete={onBanterComplete}
              onLineComplete={onBanterLineComplete}
              onCharacterTouch={triggerTouch}
              language={settings.language}
            />
          )}
        </div>

        {/* Footer Input Controls */}
        <footer className="phone-footer">
          <form onSubmit={handleSend} className="input-container-flex" style={{ display: 'flex', width: '100%', gap: '8px' }}>
            <input
              type="text"
              className="input-message"
              placeholder={
                isRestoring
                  ? (settings.language === 'ko' ? '고스트를 불러오는 중...' : 'Loading ghost...')
                  : (inputDisabled
                      ? t.thinking
                      : (activeUkagaka
                          ? (settings.language === 'ko'
                              ? `${ghostMetadata?.sakuraName || '사쿠라'}에게 말 걸기...`
                              : `Talk to ${ghostMetadata?.sakuraName || 'Sakura'}...`)
                          : t.talkPlaceholder))
              }
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              disabled={inputDisabled}
              maxLength={150}
            />
            <button
              type="submit"
              className="btn-send"
              disabled={inputDisabled || !messageInput.trim()}
              aria-label={t.send}
            >
              <Send size={15} />
            </button>
          </form>
        </footer>

        {/* Settings Modal */}
        <SettingsModal
          settings={settings}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveSettings}
          onImportNar={loadUkagaka}
          activeUkagakaName={activeUkagaka?.metadata.name}
          onResetUkagaka={unloadUkagaka}
        />

      </div>
    </div>
  );
}
