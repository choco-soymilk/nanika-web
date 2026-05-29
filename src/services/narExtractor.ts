import JSZip from 'jszip';

export interface VirtualFile {
  name: string;
  path: string; // Relative to the base folder containing install.txt
  blob?: Blob;
  text?: string;
  objectUrl?: string;
}

export interface NarMetadata {
  name?: string;
  type?: string;
  directory?: string;
  charset?: string;
}

export interface NarMascotData {
  metadata: NarMetadata;
  files: Record<string, VirtualFile>; // key is relative path, e.g., 'shell/master/surface0.png'
}

export class NarExtractor {
  private static activeObjectUrls: string[] = [];

  /**
   * Revoke all generated Object URLs to avoid memory leaks.
   */
  public static clearActiveAssets() {
    this.activeObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to revoke object URL:', e);
      }
    });
    this.activeObjectUrls = [];
  }

  /**
   * Extracts a .nar (or .zip) file buffer and returns the structured files and metadata.
   */
  private static async detectCharset(zip: JSZip): Promise<string> {
    let descriptFile: any = null;
    let installFile: any = null;

    zip.forEach((relativePath, file) => {
      const lower = relativePath.toLowerCase();
      if (lower.endsWith('ghost/master/descript.txt')) {
        descriptFile = file;
      } else if (lower.endsWith('install.txt')) {
        installFile = file;
      }
    });

    const filesToTry = [descriptFile, installFile].filter(Boolean);

    const parseCharsetLine = (text: string): string | null => {
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx !== -1) {
          const key = trimmed.slice(0, commaIdx).trim().toLowerCase();
          const val = trimmed.slice(commaIdx + 1).trim().toLowerCase();
          if (key === 'charset') return val;
        }
      }
      return null;
    };

    // First try: Explicit charset declaration
    for (const file of filesToTry) {
      try {
        const arrayBuffer = await file.async('arraybuffer');
        for (const label of ['utf-8', 'shift-jis', 'euc-kr']) {
          const text = new TextDecoder(label).decode(arrayBuffer);
          const charsetVal = parseCharsetLine(text);
          if (charsetVal) return charsetVal;
        }
      } catch (e) {}
    }

    // Second try: Language heuristic scoring
    const countHiraganaKatakana = (str: string): number => {
      let count = 0;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
          count++;
        }
      }
      return count;
    };

    const countHangul = (str: string): number => {
      let count = 0;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (
          (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x3130 && code <= 0x318f)
        ) {
          count++;
        }
      }
      return count;
    };

    for (const file of filesToTry) {
      try {
        const arrayBuffer = await file.async('arraybuffer');

        // Check for valid UTF-8 with non-ASCII characters
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          const utf8Text = utf8Decoder.decode(arrayBuffer);
          let hasNonAscii = false;
          for (let i = 0; i < utf8Text.length; i++) {
            if (utf8Text.charCodeAt(i) > 127) {
              hasNonAscii = true;
              break;
            }
          }
          if (hasNonAscii) {
            return 'utf-8';
          }
        } catch (e) {}

        const sjisText = new TextDecoder('shift-jis').decode(arrayBuffer);
        const euckrText = new TextDecoder('euc-kr').decode(arrayBuffer);

        const sjisScore = countHiraganaKatakana(sjisText);
        const euckrScore = countHangul(euckrText);

        if (sjisScore > 0 && sjisScore > euckrScore * 0.15) {
          return 'shift-jis';
        }
        if (euckrScore > 0) {
          return 'euc-kr';
        }
      } catch (e) {}
    }

    return 'utf-8';
  }

  /**
   * Extracts a .nar (or .zip) file buffer and returns the structured files and metadata.
   */
  public static async extract(fileBuffer: ArrayBuffer): Promise<NarMascotData> {
    // Revoke previous URLs before extracting a new mascot
    this.clearActiveAssets();

    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 1. Locate install.txt to find the base directory of the mascot
    let baseDir = '';
    let installTxtFile: any = null;

    zip.forEach((relativePath, file) => {
      if (relativePath.endsWith('install.txt')) {
        baseDir = relativePath.slice(0, relativePath.length - 'install.txt'.length);
        installTxtFile = file;
      }
    });

    if (!installTxtFile) {
      throw new Error('install.txt not found in the archive.');
    }

    // 2. Detect the charset using the files
    const detectedCharset = await this.detectCharset(zip);
    let decoderLabel = 'utf-8';
    const lowerCharset = detectedCharset.toLowerCase();
    if (lowerCharset === 'shift_jis' || lowerCharset === 'sjis' || lowerCharset === 'shift-jis') {
      decoderLabel = 'shift-jis';
    } else if (lowerCharset === 'euc-kr') {
      decoderLabel = 'euc-kr';
    } else if (lowerCharset === 'euc-jp') {
      decoderLabel = 'euc-jp';
    }

    // Decode install.txt with correct decoder
    const installArrayBuffer = await installTxtFile.async('arraybuffer');
    const installTxtRaw = new TextDecoder(decoderLabel).decode(installArrayBuffer);
    const metadata = this.parseInstallTxt(installTxtRaw);
    metadata.charset = detectedCharset;

    const files: Record<string, VirtualFile> = {};

    // 3. Process all files in the ZIP relative to baseDir
    for (const [relativePath, fileObj] of Object.entries(zip.files)) {
      if (fileObj.dir || !relativePath.startsWith(baseDir)) {
        continue;
      }

      // Compute relative path from the baseDir (e.g. 'shell/master/surface0.png')
      const localPath = relativePath.slice(baseDir.length);
      const fileName = localPath.split('/').pop() || localPath;

      const virtualFile: VirtualFile = {
        name: fileName,
        path: localPath,
      };

      const lowerPath = localPath.toLowerCase();

      // Handle file types (text for config/script, blob for images/sound)
      if (
        lowerPath.endsWith('.txt') ||
        lowerPath.endsWith('.dic') ||
        lowerPath.endsWith('.ini')
      ) {
        // Text files - we should read them as text with proper encoding.
        // Some older Korean/Japanese ghosts use EUC-KR or Shift_JIS encoding.
        const charset = metadata.charset?.toLowerCase() || 'utf-8';
        const arrayBuffer = await fileObj.async('arraybuffer');
        
        let decoderLabel = 'utf-8';
        if (charset === 'shift_jis' || charset === 'sjis' || charset === 'shift-jis') {
          decoderLabel = 'shift-jis';
        } else if (charset === 'euc-kr') {
          decoderLabel = 'euc-kr';
        } else if (charset === 'euc-jp') {
          decoderLabel = 'euc-jp';
        }
        
        try {
          if (lowerPath.endsWith('descript.txt')) {
            virtualFile.text = this.decodeMixedTextFile(new Uint8Array(arrayBuffer), decoderLabel);
          } else {
            const decoder = new TextDecoder(decoderLabel);
            virtualFile.text = decoder.decode(arrayBuffer);
          }
        } catch (e) {
          console.warn(`TextDecoder failed for ${decoderLabel}, falling back to UTF-8`, e);
          virtualFile.text = await fileObj.async('text');
        }
      } else {
        // Binary files (images, sounds, etc.)
        const blob = await fileObj.async('blob');
        virtualFile.blob = blob;

        if (
          lowerPath.endsWith('.png') ||
          lowerPath.endsWith('.bmp') ||
          lowerPath.endsWith('.jpg') ||
          lowerPath.endsWith('.jpeg') ||
          lowerPath.endsWith('.gif')
        ) {
          const objectUrl = URL.createObjectURL(blob);
          virtualFile.objectUrl = objectUrl;
          this.activeObjectUrls.push(objectUrl);
        }
      }

      files[localPath] = virtualFile;
    }

    return {
      metadata,
      files,
    };
  }

  private static decodeMixedTextFile(bytes: Uint8Array, defaultCharset: string): string {
    const lines: string[] = [];
    let lineStart = 0;
    
    for (let i = 0; i <= bytes.length; i++) {
      if (i === bytes.length || bytes[i] === 10 || bytes[i] === 13) {
        if (i > lineStart) {
          const lineBytes = bytes.subarray(lineStart, i);
          lines.push(this.decodeMixedLine(lineBytes, defaultCharset));
        } else {
          lines.push('');
        }
        if (i < bytes.length && bytes[i] === 13 && bytes[i + 1] === 10) {
          i++; // Skip \n after \r
        }
        lineStart = i + 1;
      }
    }
    
    return lines.join('\n');
  }

  private static decodeMixedLine(lineBytes: Uint8Array, defaultCharset: string): string {
    const commaIdx = lineBytes.indexOf(44); // ASCII ',' is 44
    if (commaIdx === -1) {
      return new TextDecoder(defaultCharset).decode(lineBytes);
    }
    
    const keyBytes = lineBytes.subarray(0, commaIdx);
    const valueBytes = lineBytes.subarray(commaIdx + 1);
    
    const key = new TextDecoder('utf-8').decode(keyBytes);
    const value = this.decodeMixedValue(valueBytes, defaultCharset);
    
    return `${key},${value}`;
  }

  private static decodeMixedValue(valueBytes: Uint8Array, defaultCharset: string): string {
    const defaultValue = new TextDecoder(defaultCharset).decode(valueBytes);
    
    const lowerDefault = defaultCharset.toLowerCase();
    if (lowerDefault.includes('euc') || lowerDefault.includes('949') || lowerDefault.includes('kr')) {
      try {
        const sjisValue = new TextDecoder('shift-jis').decode(valueBytes);
        
        const hasHangul = (str: string) => {
          for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if (c >= 0xac00 && c <= 0xd7a3) return true;
          }
          return false;
        };
        
        const hasKana = (str: string) => {
          for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if ((c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff)) return true;
          }
          return false;
        };
        
        if (!hasHangul(defaultValue) && hasKana(sjisValue)) {
          return sjisValue;
        }
      } catch (e) {
        // Fallback
      }
    }
    
    return defaultValue;
  }

  private static parseInstallTxt(content: string): NarMetadata {
    const metadata: NarMetadata = {};
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        continue;
      }

      const commaIndex = trimmed.indexOf(',');
      if (commaIndex === -1) continue;

      const key = trimmed.slice(0, commaIndex).trim().toLowerCase();
      const value = trimmed.slice(commaIndex + 1).trim();

      if (key === 'name') metadata.name = value;
      else if (key === 'type') metadata.type = value;
      else if (key === 'directory') metadata.directory = value;
      else if (key === 'charset') metadata.charset = value;
    }

    return metadata;
  }
}
