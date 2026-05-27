import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { DialogueLine, CharacterName, Emotion } from '../types';
import { SpeechBubble } from './SpeechBubble';
import { CharacterSprite } from './CharacterSprite';
import { translations } from '../data/translations';

interface WidgetProps {
  lines: DialogueLine[];
  isLoading: boolean;
  onComplete?: () => void;
  onLineComplete?: (line: DialogueLine) => void;
  onCharacterTouch?: (character: 'strawberry' | 'choco', gesture: 'tap' | 'poke' | 'pet') => void;
  language?: 'ko' | 'en';
}

const TYPING_SPEED_MS = 48;
const TURN_GAP_MS = 2200;
const END_GAP_MS = 4000;

export const WidgetSimulator: React.FC<WidgetProps> = ({
  lines,
  isLoading,
  onComplete,
  onLineComplete,
  onCharacterTouch,
  language = 'ko',
}) => {
  const [strawberryText, setStrawberryText] = useState('');
  const [chocoText, setChocoText] = useState('');
  const [strawberryEmotion, setStrawberryEmotion] = useState<Emotion>('calm');
  const [chocoEmotion, setChocoEmotion] = useState<Emotion>('cynical');
  const [activeChar, setActiveChar] = useState<CharacterName | null>(null);

  const runningRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);
  const t = translations[language];

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
  };

  const typeText = useCallback(
    (
      fullText: string,
      setter: React.Dispatch<React.SetStateAction<string>>,
      resolve: () => void
    ) => {
      let idx = 0;
      setter('');
      const tick = () => {
        idx++;
        setter(fullText.slice(0, idx));
        if (idx < fullText.length) {
          const t = window.setTimeout(tick, TYPING_SPEED_MS);
          timeoutsRef.current.push(t);
        } else {
          resolve();
        }
      };
      const t = window.setTimeout(tick, TYPING_SPEED_MS);
      timeoutsRef.current.push(t);
    },
    []
  );

  useEffect(() => {
    if (!lines || lines.length === 0) return;

    clearTimeouts();
    setStrawberryText('');
    setChocoText('');
    runningRef.current = true;

    const playSequence = async () => {
      for (let i = 0; i < lines.length; i++) {
        if (!runningRef.current) break;
        const line = lines[i];
        const isStrawberry = line.character === 'strawberry';

        if (isStrawberry) {
          setStrawberryEmotion(line.emotion);
          setActiveChar('strawberry');
          setChocoText('');
          setStrawberryText('');
          await new Promise<void>((res) => typeText(line.text, setStrawberryText, res));
        } else if (line.character === 'choco') {
          setChocoEmotion(line.emotion);
          setActiveChar('choco');
          setStrawberryText('');
          setChocoText('');
          await new Promise<void>((res) => typeText(line.text, setChocoText, res));
        }

        // Notify parent that this line has completed typing (to add to history)
        if (runningRef.current) {
          onLineComplete?.(line);
        }

        // Wait before starting next turn
        if (i < lines.length - 1) {
          await new Promise<void>((res) => {
            const t = window.setTimeout(res, TURN_GAP_MS);
            timeoutsRef.current.push(t);
          });
        }
      }

      // Wait before closing/clearing dialogue
      if (runningRef.current) {
        await new Promise<void>((res) => {
          const t = window.setTimeout(res, END_GAP_MS);
          timeoutsRef.current.push(t);
        });
      }

      if (runningRef.current) {
        setActiveChar(null);
        setStrawberryText('');
        setChocoText('');
        onComplete?.();
      }
    };

    playSequence();

    return () => {
      runningRef.current = false;
      clearTimeouts();
    };
  }, [lines, typeText, onComplete, onLineComplete]);

  return (
    <div className="widget-container">
      <div className="widget-frame">
        <div className="characters-row">
          
          {/* Strawberry Slot */}
          <div className="character-slot strawberry-slot">
            <div className="bubble-container">
              <SpeechBubble
                text={isLoading && activeChar === 'strawberry' ? t.thinkingBubbleStrawberry : strawberryText}
                emotion={strawberryEmotion}
                isActive={activeChar === 'strawberry'}
                side="left"
              />
            </div>
            <CharacterSprite
              character="strawberry"
              isActive={activeChar === 'strawberry'}
              emotion={strawberryEmotion}
              onTouch={(gesture) => onCharacterTouch?.('strawberry', gesture)}
            />
            <div className="name-tag">{t.charStrawberry}</div>
          </div>

          {/* Choco Slot */}
          <div className="character-slot choco-slot">
            <div className="bubble-container">
              <SpeechBubble
                text={isLoading && activeChar === 'choco' ? t.thinkingBubbleChoco : chocoText}
                emotion={chocoEmotion}
                isActive={activeChar === 'choco'}
                side="right"
              />
            </div>
            <CharacterSprite
              character="choco"
              isActive={activeChar === 'choco'}
              emotion={chocoEmotion}
              onTouch={(gesture) => onCharacterTouch?.('choco', gesture)}
            />
            <div className="name-tag">{t.charChoco}</div>
          </div>

        </div>

        {/* Loading status bar indicator */}
        {isLoading && (
          <div className="loading-progress-bar" />
        )}
      </div>
    </div>
  );
};
