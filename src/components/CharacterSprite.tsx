import React, { useRef, useState } from 'react';
import type { CharacterName } from '../types';

interface SpriteProps {
  character: CharacterName;
  isActive: boolean;
  onTouch?: (gesture: 'tap' | 'poke' | 'pet') => void;
}

export const CharacterSprite: React.FC<SpriteProps> = ({ character, isActive, onTouch }) => {
  const [isPressed, setIsPressed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const isDraggingRef = useRef(false);

  const handleStart = (clientX: number, clientY: number) => {
    touchStartRef.current = {
      x: clientX,
      y: clientY,
      time: Date.now(),
    };
    isDraggingRef.current = false;
    setIsPressed(true);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (touchStartRef.current.time === 0) return;
    const deltaX = Math.abs(clientX - touchStartRef.current.x);
    const deltaY = Math.abs(clientY - touchStartRef.current.y);

    if (deltaX > 25 || deltaY > 25) {
      isDraggingRef.current = true;
    }
  };

  const handleEnd = () => {
    if (touchStartRef.current.time === 0) return;

    const duration = Date.now() - touchStartRef.current.time;
    setIsPressed(false);

    if (isDraggingRef.current) {
      onTouch?.('pet');
    } else if (duration >= 600) {
      onTouch?.('poke');
    } else {
      onTouch?.('tap');
    }

    touchStartRef.current = { x: 0, y: 0, time: 0 };
  };

  // Mouse event handlers
  const onMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const onMouseUp = () => {
    handleEnd();
  };

  // Touch event handlers for mobile devices
  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const onTouchEnd = () => {
    // TouchEnd doesn't have active touches inside e.touches
    handleEnd();
  };

  const isStrawberry = character === 'strawberry';
  
  // Choose sprite image source. Note that these are copied to public/assets/
  const spriteSrc = isStrawberry ? '/assets/strawberry.png' : '/assets/choco.png';
  const characterLabel = isStrawberry ? 'strawberry' : 'choco';

  return (
    <div
      className={`character-sprite-container ${characterLabel} ${isActive ? 'active' : ''} ${isPressed ? 'pressed' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <img
        src={spriteSrc}
        alt={isStrawberry ? 'Strawberry' : 'Choco'}
        className={`character-sprite ${isStrawberry ? 'strawberry-img' : 'choco-img'}`}
        draggable={false}
      />
    </div>
  );
};
