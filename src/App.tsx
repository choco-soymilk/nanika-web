import React, { useState } from 'react';
import { useBanterLoop } from './hooks/useBanterLoop';
import { useWakeLock } from './hooks/useWakeLock';
import { WidgetSimulator } from './components/WidgetSimulator';
import { ChatHistory } from './components/ChatHistory';
import { SettingsModal } from './components/SettingsModal';
import { Send, Settings as SettingsIcon, AlertCircle, ShieldAlert } from 'lucide-react';

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text || isLoading) return;

    sendMessage(text);
    setMessageInput('');
  };

  const handleSaveSettings = (apiKey: string, banterInterval: number, userName: string, maxHistoryLimit: number) => {
    saveSettings(apiKey, banterInterval, userName, maxHistoryLimit);
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
            <h1 className="app-title">나니포케</h1>
            <span className="app-subtitle">Nanika Pocket</span>
          </div>
          <button
            className="btn-settings"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="설정 열기"
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
                오류: {apiError}
              </span>
              <button className="banner-link" onClick={() => setApiError(null)}>
                닫기
              </button>
            </div>
          )}

          {/* Key Missing Warning (Mock dialogue mode indicator) */}
          {!settings.apiKey && !apiError && (
            <div className="status-banner no-key">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <ShieldAlert size={14} style={{ marginRight: '6px' }} />
                Gemini API 키 없음 — Mock 대화 중
              </span>
              <button className="banner-link" onClick={() => setIsSettingsOpen(true)}>
                키 입력 →
              </button>
            </div>
          )}

          {/* Chat History Logs */}
          <ChatHistory history={chatHistory} onClear={clearHistory} userName={settings.userName} />
        </main>

        {/* Mascot Speech Simulator Layer (Floating inside overlay above footer) */}
        <div className="character-fixed-overlay">
          <WidgetSimulator
            lines={currentDialogue}
            isLoading={isLoading}
            onComplete={onBanterComplete}
            onLineComplete={onBanterLineComplete}
            onCharacterTouch={triggerTouch}
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
                  ? '답변을 생각 중입니다...'
                  : '딸기와 초코에게 말 걸기...'
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
              aria-label="전송"
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
