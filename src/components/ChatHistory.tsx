import React, { useEffect, useRef } from 'react';
import type { DialogueLine } from '../types';
import { Trash2 } from 'lucide-react';

interface HistoryProps {
  history: DialogueLine[];
  onClear: () => void;
  userName?: string;
}

export const ChatHistory: React.FC<HistoryProps> = ({ history, onClear, userName = '주인' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
        대화 기록이 없습니다. 딸기와 초코에게 말을 걸거나 머리를 쓰다듬어 보세요!
      </div>
    );
  }

  return (
    <div className="chat-history-container">
      <div className="chat-history-header">
        <span className="chat-history-title">대화 기록 ({history.length})</span>
        <button className="btn-clear-history" onClick={onClear} title="기록 전체 삭제">
          <Trash2 size={14} style={{ marginRight: '4px' }} />
          지우기
        </button>
      </div>

      <div className="chat-history-list" ref={containerRef}>
        {history.map((line, index) => {
          const isStrawberry = line.character === 'strawberry';
          const isUser = line.character === 'user';
          
          let speakerTag = `👤 ${userName}`;
          let bubbleClass = 'bubble-user';
          if (isStrawberry) {
            speakerTag = '🍓 딸기';
            bubbleClass = 'bubble-strawberry';
          } else if (line.character === 'choco') {
            speakerTag = '🍫 초코';
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
