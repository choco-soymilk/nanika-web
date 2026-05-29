import React, { useEffect, useRef, useState } from 'react';
import type { VirtualFile } from '../services/narExtractor';
import type { SurfaceDefinition, ShellElement } from '../services/shellParser';

interface UkagakaRendererProps {
  files: Record<string, VirtualFile>;
  surfaceId: number;
  surfaces: Record<number, SurfaceDefinition>;
  isTalking: boolean;
  onCollisionClick?: (label: string, isDoubleClick: boolean) => void;
  onCollisionMouseMove?: (label: string) => void;
  characterScope: number; // 0 = main, 1 = partner
}

export const UkagakaRenderer: React.FC<UkagakaRendererProps> = ({
  files,
  surfaceId,
  surfaces,
  isTalking,
  onCollisionClick,
  onCollisionMouseMove,
  characterScope,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  
  // Animation state
  const [activeOverlayFrames, setActiveOverlayFrames] = useState<{ surfaceId: number; x: number; y: number }[]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Touch/Mouse gesture state for petting
  const lastMoveRef = useRef<{ time: number; x: number; y: number; label: string }>({ time: 0, x: 0, y: 0, label: '' });

  // Get current surface definition
  const surfaceDef: SurfaceDefinition | undefined = surfaces[surfaceId];

  // Apply chroma key transparency to legacy images (using color at 0,0 as transparent)
  const makeChromaKeyTransparent = (img: HTMLImageElement): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(img);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        if (data.length < 4) {
          resolve(img);
          return;
        }

        // Get key color from top-left pixel (0,0)
        const keyR = data[0];
        const keyG = data[1];
        const keyB = data[2];
        const keyA = data[3];

        // If top-left is already fully transparent, do not process
        if (keyA === 0) {
          resolve(img);
          return;
        }

        // Replace key color with transparency
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (r === keyR && g === keyG && b === keyB && a === keyA) {
            data[i + 3] = 0; // Alpha = 0
          }
        }

        ctx.putImageData(imgData, 0, 0);

        const newImg = new Image();
        newImg.src = canvas.toDataURL();
        newImg.onload = () => resolve(newImg);
        newImg.onerror = () => resolve(img);
      } catch (e) {
        console.error('[UkagakaRenderer] Chroma key transparency error:', e);
        resolve(img);
      }
    });
  };

  // Helper to load an image, process transparency, and cache it
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    if (imageCacheRef.current[url]) {
      return Promise.resolve(imageCacheRef.current[url]);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = async () => {
        try {
          const transImg = await makeChromaKeyTransparent(img);
          imageCacheRef.current[url] = transImg;
          resolve(transImg);
        } catch (err) {
          imageCacheRef.current[url] = img;
          resolve(img);
        }
      };
      img.onerror = reject;
    });
  };

  // 1. Gather all file paths needed for the current base surface
  const getBaseElements = (): ShellElement[] => {
    if (surfaceDef && surfaceDef.elements.length > 0) {
      return surfaceDef.elements;
    }
    // Fallback: search for shell/master/surface[surfaceId].png
    const fallbackPath = Object.keys(files).find((p) => {
      const lower = p.toLowerCase();
      return lower.includes('shell/') && lower.endsWith(`surface${surfaceId}.png`);
    });
    if (fallbackPath) {
      return [{ type: 'base', filename: fallbackPath, x: 0, y: 0 }];
    }
    return [];
  };

  const baseElements = getBaseElements();

  // 2. Preload images when surface elements change
  useEffect(() => {
    if (baseElements.length === 0) {
      setImagesLoaded(false);
      return;
    }

    setImagesLoaded(false);
    const loadPromises = baseElements.map((el) => {
      const file = files[el.filename];
      if (file?.objectUrl) {
        return loadImage(file.objectUrl);
      }
      return Promise.reject(new Error(`Missing object URL for ${el.filename}`));
    });

    Promise.all(loadPromises)
      .then(() => {
        setImagesLoaded(true);
      })
      .catch((err) => {
        console.error('[UkagakaRenderer] Error preloading base images:', err);
      });
  }, [surfaceId, files]);

  // 3. Handle animations (Eye blinking, talking lip sync)
  useEffect(() => {
    if (!surfaceDef || surfaceDef.animations.length === 0) {
      setActiveOverlayFrames([]);
      return;
    }

    const activeTimers: number[] = [];
    const activeIntervals: number[] = [];

    // Animation runner
    const playAnim = async (animId: number) => {
      const anim = surfaceDef.animations.find((a) => a.id === animId);
      if (!anim || anim.patterns.length === 0) return;

      for (const pattern of anim.patterns) {
        // Load the overlay surface image
        const overlayDef = surfaces[pattern.surfaceId];
        if (overlayDef && overlayDef.elements.length > 0) {
          const firstEl = overlayDef.elements[0];
          const file = files[firstEl.filename];
          if (file?.objectUrl) {
            try {
              await loadImage(file.objectUrl);
              setActiveOverlayFrames((prev) => [
                ...prev,
                { surfaceId: pattern.surfaceId, x: pattern.x + firstEl.x, y: pattern.y + firstEl.y }
              ]);
            } catch (e) {
              console.error('Failed to load pattern frame:', e);
            }
          }
        }

        // Wait pattern duration
        await new Promise((res) => {
          const t = window.setTimeout(res, pattern.duration);
          activeTimers.push(t);
        });

        // Clear pattern frame
        setActiveOverlayFrames((prev) => prev.filter((f) => f.surfaceId !== pattern.surfaceId));
      }
    };

    // Schedule intervals: 'sometimes', 'rarely', 'always', 'talk'
    surfaceDef.animations.forEach((anim) => {
      if (anim.interval === 'sometimes') {
        const interval = window.setInterval(() => {
          if (Math.random() < 0.5) {
            playAnim(anim.id);
          }
        }, 3000);
        activeIntervals.push(interval);
      } else if (anim.interval === 'rarely') {
        const interval = window.setInterval(() => {
          if (Math.random() < 0.3) {
            playAnim(anim.id);
          }
        }, 8000);
        activeIntervals.push(interval);
      } else if (anim.interval === 'always') {
        const interval = window.setInterval(() => {
          playAnim(anim.id);
        }, 4000);
        activeIntervals.push(interval);
      }
    });

    // Talk sync timer
    let talkInterval: number | null = null;
    if (isTalking) {
      const talkAnims = surfaceDef.animations.filter((a) => a.interval === 'talk');
      if (talkAnims.length > 0) {
        talkInterval = window.setInterval(() => {
          const randomTalkAnim = talkAnims[Math.floor(Math.random() * talkAnims.length)];
          playAnim(randomTalkAnim.id);
        }, 400);
      }
    }

    return () => {
      activeTimers.forEach(window.clearTimeout);
      activeIntervals.forEach(window.clearInterval);
      if (talkInterval) window.clearInterval(talkInterval);
    };
  }, [surfaceId, surfaces, isTalking, files]);

  // 4. Drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imagesLoaded || baseElements.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get the base image to set canvas size
    const firstEl = baseElements[0];
    const firstImg = imageCacheRef.current[files[firstEl.filename]?.objectUrl || ''];
    if (!firstImg) return;

    // Set canvas dimensions to fit base image
    canvas.width = firstImg.naturalWidth || 300;
    canvas.height = firstImg.naturalHeight || 400;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw base layers
    baseElements.forEach((el) => {
      const img = imageCacheRef.current[files[el.filename]?.objectUrl || ''];
      if (img) {
        ctx.drawImage(img, el.x, el.y);
      }
    });

    // Draw active animation frames
    activeOverlayFrames.forEach((frame) => {
      const overlayDef = surfaces[frame.surfaceId];
      if (overlayDef) {
        overlayDef.elements.forEach((el) => {
          const img = imageCacheRef.current[files[el.filename]?.objectUrl || ''];
          if (img) {
            ctx.drawImage(img, el.x + frame.x, el.y + frame.y);
          }
        });
      }
    });
  }, [imagesLoaded, baseElements, activeOverlayFrames, files]);

  // 5. Collision coordinate checker helper
  const getCollisionAtCoords = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !surfaceDef || surfaceDef.collisions.length === 0) return null;

    const rect = canvas.getBoundingClientRect();
    // Convert click coordinates to canvas pixel space
    const clickX = ((clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((clientY - rect.top) / rect.height) * canvas.height;

    // Search collisions in reverse order (topmost layer priority)
    for (let i = surfaceDef.collisions.length - 1; i >= 0; i--) {
      const col = surfaceDef.collisions[i];
      if (
        col.startX <= clickX &&
        clickX <= col.endX &&
        col.startY <= clickY &&
        clickY <= col.endY
      ) {
        return col.label;
      }
    }
    return null;
  };

  // Click & Double click handlers
  const handleMouseClick = (e: React.MouseEvent, isDbl: boolean) => {
    const label = getCollisionAtCoords(e.clientX, e.clientY);
    if (label) {
      onCollisionClick?.(label, isDbl);
    } else {
      // Default fallback clicks (Tap/Poke on whole body if no specific collision)
      onCollisionClick?.(isDbl ? 'Head' : 'Body', isDbl);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const label = getCollisionAtCoords(touch.clientX, touch.clientY);
    if (label) {
      lastMoveRef.current = {
        time: Date.now(),
        x: touch.clientX,
        y: touch.clientY,
        label,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const start = lastMoveRef.current;
    if (start.time === 0) return;

    const duration = Date.now() - start.time;
    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);

    if (deltaX > 30 || deltaY > 30) {
      // Drag gesture counts as petting
      onCollisionMouseMove?.(start.label);
    } else {
      onCollisionClick?.(start.label, duration >= 500);
    }

    lastMoveRef.current = { time: 0, x: 0, y: 0, label: '' };
  };

  // Mouse petting detection
  const handleMouseMove = (e: React.MouseEvent) => {
    const label = getCollisionAtCoords(e.clientX, e.clientY);
    if (!label) return;

    const now = Date.now();
    const last = lastMoveRef.current;

    // Check if rubbing back and forth within the same collision label
    if (last.label === label && now - last.time > 100 && now - last.time < 1000) {
      const distance = Math.sqrt(Math.pow(e.clientX - last.x, 2) + Math.pow(e.clientY - last.y, 2));
      if (distance > 20) {
        onCollisionMouseMove?.(label);
        lastMoveRef.current = { time: now, x: e.clientX, y: e.clientY, label };
      }
    } else {
      lastMoveRef.current = { time: now, x: e.clientX, y: e.clientY, label };
    }
  };

  return (
    <div className={`ukagaka-canvas-container scope-${characterScope}`} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {!imagesLoaded && (
        <div className="renderer-spinner" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.6 }}>
          {/* Simple loading text/indicator */}
          Drawing...
        </div>
      )}
      <canvas
        ref={canvasRef}
        onClick={(e) => handleMouseClick(e, false)}
        onDoubleClick={(e) => handleMouseClick(e, true)}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          maxWidth: '100%',
          maxHeight: '260px',
          height: 'auto',
          objectFit: 'contain',
          cursor: 'pointer',
          imageRendering: 'pixelated', // Keep pixel art sharp
        }}
      />
    </div>
  );
};
