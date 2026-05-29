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
  } = useBanterLoop();

  const {
    activeUkagaka,
    shellData,
    ghostMetadata,
    playerState,
    isLoading: isUkagakaLoading,
    error: ukagakaError,
    loadUkagaka,
    unloadUkagaka,
    triggerEvent: triggerUkagakaEvent,
  } = useUkagaka(settings.userName, settings.banterInterval, onBanterLineComplete);

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
    language: 'ko' | 'en'
  ) => {
    saveSettings(apiKey, banterInterval, userName, maxHistoryLimit, language);
  };

  // Disable text entry ONLY when API request or Ukagaka processing is pending
  const inputDisabled = activeUkagaka ? (isUkagakaLoading || !playerState.isFinished) : isLoading;

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
          />
        </main>

        {/* Mascot Speech Simulator Layer (Floating inside overlay above footer) */}
        <div className="character-fixed-overlay">
          {activeUkagaka && shellData ? (
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
                inputDisabled
                  ? t.thinking
                  : (activeUkagaka
                      ? (settings.language === 'ko'
                          ? `${ghostMetadata?.sakuraName || '사쿠라'}에게 말 걸기...`
                          : `Talk to ${ghostMetadata?.sakuraName || 'Sakura'}...`)
                      : t.talkPlaceholder)
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
