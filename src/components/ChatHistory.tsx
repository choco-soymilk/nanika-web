import React, { useEffect, useRef } from 'react';
import type { DialogueLine } from '../types';
import { Trash2 } from 'lucide-react';
import { translations } from '../data/translations';
import { getEffectiveUserName } from '../services/storage';

interface HistoryProps {
  history: DialogueLine[];
  onClear: () => void;
  userName?: string;
  language?: 'ko' | 'en';
  emptyMessage?: string;
  isUkagakaActive?: boolean;
}

export const ChatHistory: React.FC<HistoryProps> = ({
  history,
  onClear,
  userName = '주인',
  language = 'ko',
  emptyMessage,
  isUkagakaActive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Auto-scroll to bottom when new history items arrive
  useEffect(() => {
    if (containerRef.current) {
      const scrollParent = containerRef.current.closest('.phone-content');
      if (scrollParent) {
        scrollParent.scrollTop = scrollParent.scrollHeight;
      }
    }
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="history-empty">
        {emptyMessage || t.emptyHistory}
      </div>
    );
  }

  return (
    <div className="chat-history-container">
      <div className="chat-history-header">
        <span className="chat-history-title">{t.chatHistory} ({history.length})</span>
        <button className="btn-clear-history" onClick={onClear} title={t.clearHistoryTitle}>
          <Trash2 size={14} style={{ marginRight: '4px' }} />
          {t.clear}
        </button>
      </div>

      <div className="chat-history-list" ref={containerRef}>
        {history.map((line, index) => {
          const isStrawberry = line.character === 'strawberry';
          const isUser = line.character === 'user';
          
          let speakerTag = `👤 ${getEffectiveUserName(userName, language)}`;
          let bubbleClass = 'bubble-user';
          if (isStrawberry) {
            const prefix = isUkagakaActive ? '🌸' : '🍓';
            speakerTag = `${prefix} ${line.speakerName || t.charStrawberry}`;
            bubbleClass = 'bubble-strawberry';
          } else if (line.character === 'choco') {
            const prefix = isUkagakaActive ? '🍀' : '🍫';
            speakerTag = `${prefix} ${line.speakerName || t.charChoco}`;
            bubbleClass = 'bubble-choco';
          }

          return (
            <div key={line.timestamp || index} className={`chat-history-row ${isUser ? 'row-user' : 'row-mascot'}`}>
              <div className="chat-history-label">{speakerTag}</div>
              <div className={`chat-history-bubble ${bubbleClass}`}>
                {line.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
