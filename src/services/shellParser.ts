import type { VirtualFile } from './narExtractor';

export interface ShellElement {
  type: string; // 'base', 'overlay', 'replace', etc.
  filename: string;
  x: number;
  y: number;
}

export interface ShellCollision {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label: string;
}

export interface ShellAnimationPattern {
  type: string; // 'overlay', 'replace', etc.
  surfaceId: number;
  duration: number; // in milliseconds
  x: number;
  y: number;
}

export interface ShellAnimation {
  id: number;
  interval: string; // 'sometimes', 'rarely', 'always', 'never', 'talk', etc.
  patterns: ShellAnimationPattern[];
}

export interface SurfaceDefinition {
  id: number;
  elements: ShellElement[];
  collisions: ShellCollision[];
  animations: ShellAnimation[];
}

export interface ShellData {
  name: string;
  descript: Record<string, string>;
  surfaces: Record<number, SurfaceDefinition>;
}

export class ShellParser {
  /**
   * Parses the shell metadata and surface configurations.
   */
  public static parse(files: Record<string, VirtualFile>): ShellData {
    // 1. Locate descript.txt in shell folder
    let shellPathPrefix = '';
    let descriptContent = '';
    let surfacesContent = '';

    for (const path of Object.keys(files)) {
      if (path.includes('shell/') && path.endsWith('descript.txt')) {
        // e.g. "shell/master/descript.txt" -> "shell/master/"
        shellPathPrefix = path.slice(0, path.length - 'descript.txt'.length);
        descriptContent = files[path].text || '';
        break;
      }
    }

    // Parse descript.txt
    const descript = this.parseKeyValue(descriptContent);
    const name = descript['name'] || 'Default Shell';

    // 2. Check for surfaces.txt
    const surfacesTxtPath = `${shellPathPrefix}surfaces.txt`;
    if (files[surfacesTxtPath]) {
      surfacesContent = files[surfacesTxtPath].text || '';
    }

    const surfaces: Record<number, SurfaceDefinition> = {};

    if (surfacesContent) {
      this.parseSurfacesTxt(surfacesContent, surfaces, files, shellPathPrefix);
    } else {
      // Fallback: Generate surface definitions from file names matching "surface*.png"
      this.generateFallbackSurfaces(files, shellPathPrefix, surfaces);
    }

    return {
      name,
      descript,
      surfaces,
    };
  }

  private static parseKeyValue(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
      
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex === -1) {
        const eqIndex = trimmed.indexOf('='); // บางที่อาจใช้ =
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
        const value = trimmed.slice(eqIndex + 1).trim();
        result[key] = value;
      } else {
        const key = trimmed.slice(0, commaIndex).trim().toLowerCase();
        const value = trimmed.slice(commaIndex + 1).trim();
        result[key] = value;
      }
    }
    return result;
  }

  private static parseSurfacesTxt(
    content: string,
    surfaces: Record<number, SurfaceDefinition>,
    files: Record<string, VirtualFile>,
    shellPrefix: string
  ) {
    // Standard surfaces.txt parser
    // Tokenize text into blocks
    const lines = content.split(/\r?\n/);
    let currentBlockHeaders: number[] = [];
    let insideBlock = false;
    let blockLines: string[] = [];

    const getSurface = (id: number): SurfaceDefinition => {
      if (!surfaces[id]) {
        surfaces[id] = { id, elements: [], collisions: [], animations: [] };
      }
      return surfaces[id];
    };

    for (let line of lines) {
      // Clean comments
      const commentIdx = line.indexOf('//');
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx);
      }
      const commentHashIdx = line.indexOf('#');
      if (commentHashIdx !== -1) {
        line = line.slice(0, commentHashIdx);
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === '{') {
        insideBlock = true;
        blockLines = [];
        continue;
      }

      if (trimmed === '}') {
        if (insideBlock && currentBlockHeaders.length > 0) {
          // Process collected block lines for all headers
          for (const sId of currentBlockHeaders) {
            this.processBlockContent(getSurface(sId), blockLines, files, shellPrefix);
          }
        }
        insideBlock = false;
        currentBlockHeaders = [];
        blockLines = [];
        continue;
      }

      if (!insideBlock) {
        // Parse block header (e.g. surface0, surface0,1,2, surface.range0-10)
        currentBlockHeaders = this.parseBlockHeaders(trimmed);
      } else {
        blockLines.push(trimmed);
      }
    }
  }

  private static parseBlockHeaders(header: string): number[] {
    const ids: number[] = [];
    // e.g. "surface0" or "surface0,1,2" or "surface.range0-9"
    const cleaned = header.toLowerCase().replace(/\s+/g, '');
    
    if (cleaned.startsWith('surface')) {
      const value = cleaned.slice('surface'.length);
      if (value.startsWith('.range')) {
        // e.g. ".range0-9"
        const rangeStr = value.slice('.range'.length);
        const parts = rangeStr.split('-');
        if (parts.length === 2) {
          const start = parseInt(parts[0], 10);
          const end = parseInt(parts[1], 10);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              ids.push(i);
            }
          }
        }
      } else {
        // e.g. "0" or "0,1,2"
        const parts = value.split(',');
        for (const p of parts) {
          const id = parseInt(p, 10);
          if (!isNaN(id)) {
            ids.push(id);
          }
        }
      }
    }
    return ids;
  }

  private static processBlockContent(
    surface: SurfaceDefinition,
    lines: string[],
    files: Record<string, VirtualFile>,
    shellPrefix: string
  ) {
    for (const line of lines) {
      // Element: element0,overlay,surface000.png,0,0
      if (line.startsWith('element')) {
        const parts = line.split(',');
        if (parts.length >= 5) {
          const type = parts[1].trim();
          const filename = parts[2].trim();
          const x = parseInt(parts[3].trim(), 10) || 0;
          const y = parseInt(parts[4].trim(), 10) || 0;
          
          // Verify if image exists (sometimes casing differs, or file doesn't exist)
          const actualFilename = this.findActualFilename(filename, files, shellPrefix);
          if (actualFilename) {
            surface.elements.push({ type, filename: actualFilename, x, y });
          }
        }
      }
      // Collision: collision0,10,15,80,95,Head
      else if (line.startsWith('collision')) {
        const parts = line.split(',');
        if (parts.length >= 6) {
          const idStr = parts[0].slice('collision'.length);
          const id = parseInt(idStr, 10) || 0;
          const startX = parseInt(parts[1].trim(), 10) || 0;
          const startY = parseInt(parts[2].trim(), 10) || 0;
          const endX = parseInt(parts[3].trim(), 10) || 0;
          const endY = parseInt(parts[4].trim(), 10) || 0;
          const label = parts[5].trim();
          
          surface.collisions.push({ id, startX, startY, endX, endY, label });
        }
      }
      // Animation settings:
      // animation0.interval,sometimes
      // animation0.pattern0,overlay,100,50,0,0
      else if (line.startsWith('animation')) {
        const dotIdx = line.indexOf('.');
        if (dotIdx === -1) continue;

        const animIdStr = line.slice('animation'.length, dotIdx);
        const animId = parseInt(animIdStr, 10);
        if (isNaN(animId)) continue;

        const rest = line.slice(dotIdx + 1);
        const commaIdx = rest.indexOf(',');
        if (commaIdx === -1) continue;

        const subKey = rest.slice(0, commaIdx).trim();
        const value = rest.slice(commaIdx + 1).trim();

        let anim = surface.animations.find((a) => a.id === animId);
        if (!anim) {
          anim = { id: animId, interval: 'never', patterns: [] };
          surface.animations.push(anim);
        }

        if (subKey === 'interval') {
          anim.interval = value.toLowerCase();
        } else if (subKey.startsWith('pattern')) {
          // e.g. "pattern0" -> value is "overlay,100,50,0,0" (type, surfaceId, duration, x, y)
          const parts = value.split(',');
          if (parts.length >= 3) {
            const type = parts[0].trim();
            const surfaceId = parseInt(parts[1].trim(), 10) || 0;
            const duration = parseInt(parts[2].trim(), 10) || 100;
            const x = parseInt(parts[3]?.trim(), 10) || 0;
            const y = parseInt(parts[4]?.trim(), 10) || 0;

            anim.patterns.push({ type, surfaceId, duration, x, y });
          }
        }
      }
    }
  }

  /**
   * Helper to resolve filenames in Ukagaka ZIPs which can be case-insensitive or have sub-paths.
   */
  private static findActualFilename(
    filename: string,
    files: Record<string, VirtualFile>,
    shellPrefix: string
  ): string | null {
    const fullPathOption1 = `${shellPrefix}${filename}`;
    if (files[fullPathOption1]) return fullPathOption1;

    // Case-insensitive fallback
    const lowerTarget = fullPathOption1.toLowerCase();
    for (const key of Object.keys(files)) {
      if (key.toLowerCase() === lowerTarget) {
        return key;
      }
    }

    return null;
  }

  private static generateFallbackSurfaces(
    files: Record<string, VirtualFile>,
    shellPrefix: string,
    surfaces: Record<number, SurfaceDefinition>
  ) {
    // Loop through files and match shell/master/surface(\d+).png
    const surfaceRegex = /surface(\d+)\.png$/i;
    for (const path of Object.keys(files)) {
      if (!path.startsWith(shellPrefix)) continue;
      
      const match = path.match(surfaceRegex);
      if (match) {
        const id = parseInt(match[1], 10);
        if (!isNaN(id)) {
          surfaces[id] = {
            id,
            elements: [{ type: 'base', filename: path, x: 0, y: 0 }],
            collisions: [],
            animations: [],
          };
        }
      }
    }
  }
}
