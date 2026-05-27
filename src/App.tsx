import React, { useState } from 'react';
import { useBanterLoop } from './hooks/useBanterLoop';
import { useWakeLock } from './hooks/useWakeLock';
import { WidgetSimulator } from './components/WidgetSimulator';
import { ChatHistory } from './components/ChatHistory';
import { SettingsModal } from './components/SettingsModal';
import { Send, Settings as SettingsIcon, AlertCircle, ShieldAlert } from 'lucide-react';
import { translations } from './data/translations';

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
  } = useBanterLoop();

  const [messageInput, setMessageInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const t = translations[settings.language || 'ko'];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text || isLoading) return;

    sendMessage(text);
    setMessageInput('');
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

  // Disable text entry ONLY when API request is pending (loading)
  const inputDisabled = isLoading;

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

          {/* Key Missing Warning (Mock dialogue mode indicator) */}
          {!settings.apiKey && !apiError && (
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
          />
        </main>

        {/* Mascot Speech Simulator Layer (Floating inside overlay above footer) */}
        <div className="character-fixed-overlay">
          <WidgetSimulator
            lines={currentDialogue}
            isLoading={isLoading}
            onComplete={onBanterComplete}
            onLineComplete={onBanterLineComplete}
            onCharacterTouch={triggerTouch}
            language={settings.language}
          />
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
                  : t.talkPlaceholder
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
        />

      </div>
    </div>
  );
}
