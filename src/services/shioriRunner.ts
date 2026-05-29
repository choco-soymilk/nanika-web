import type { VirtualFile } from './narExtractor';

export interface GhostMetadata {
  name: string;
  sakuraName: string;
  keroName: string;
  charset: string;
}

export class ShioriRunner {
  private ghostFiles: Record<string, VirtualFile> = {};
  private metadata: GhostMetadata = {
    name: 'Default Ghost',
    sakuraName: 'Sakura',
    keroName: 'Kero',
    charset: 'utf-8',
  };

  // Event name -> list of script strings
  private events: Record<string, string[]> = {};
  // Random talk list (from aitalk.txt)
  private randomTalks: string[] = [];

  private userName = 'Master';
  private strokeCounts: Record<string, number> = {};

  constructor(files: Record<string, VirtualFile>, userName?: string, defaultCharset?: string) {
    this.ghostFiles = files;
    if (userName) {
      this.userName = userName;
    }
    if (defaultCharset) {
      this.metadata.charset = defaultCharset;
    }
    this.parseGhost();
  }

  public isJapaneseGhost(): boolean {
    const charset = (this.metadata.charset || '').toLowerCase();
    if (charset.includes('jis') || charset.includes('sjis') || charset.includes('jp')) {
      return true;
    }
    const hasJapaneseChar = (str: string) => {
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
          return true;
        }
      }
      return false;
    };
    return hasJapaneseChar(this.metadata.sakuraName) || hasJapaneseChar(this.metadata.keroName) || hasJapaneseChar(this.metadata.name);
  }

  private parseGhost() {
    // 1. Locate ghost/master/descript.txt
    let descriptContent = '';
    for (const [path, file] of Object.entries(this.ghostFiles)) {
      if (path.includes('ghost/master/') && path.endsWith('descript.txt')) {
        descriptContent = file.text || '';
        break;
      }
    }

    if (descriptContent) {
      const lines = descriptContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx !== -1) {
          const key = trimmed.slice(0, commaIdx).trim().toLowerCase();
          const val = trimmed.slice(commaIdx + 1).trim();
          if (key === 'name') this.metadata.name = val;
          else if (key === 'sakura.name') this.metadata.sakuraName = val;
          else if (key === 'kero.name') this.metadata.keroName = val;
          else if (key === 'charset') this.metadata.charset = val;
        }
      }
    }

    // 2. Parse all text/dictionary files under ghost/master
    for (const [path, file] of Object.entries(this.ghostFiles)) {
      if (!path.includes('ghost/master/')) continue;
      const content = file.text;
      if (!content) continue;

      const lowerPath = path.toLowerCase();

      // Check if it is aitalk.txt (standard random dialogue file)
      if (lowerPath.endsWith('aitalk.txt')) {
        this.parseAitalk(content);
        continue;
      }

      // Parse as Satori/YAYA dictionary
      this.parseDictionary(content);

      // Parse as Kawari dictionary
      this.parseKawari(content);
    }

    // Merge standard talk events into randomTalks
    const talkEvents = ['OnAiTalk', 'Aitalk', 'OnAitalk', 'sentence', 'randomtalk'];
    for (const event of talkEvents) {
      if (this.events[event]) {
        this.randomTalks.push(...this.events[event]);
        delete this.events[event];
      }
    }

    // Add fallback scripts if empty to guarantee stability
    this.addFallbacks();
  }

  private parseAitalk(content: string) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
      // Aitalk lines often look like: \0\s[0]오늘 날씨가 좋네.\e
      if (trimmed.includes('\\') || trimmed.length > 5) {
        this.randomTalks.push(trimmed);
      }
    }
  }

  private parseDictionary(content: string) {
    // Satori parser: Looks for headers like:
    // * OnEventName
    // dialogue line 1
    // dialogue line 2
    const lines = content.split(/\r?\n/);
    let currentEvent: string | null = null;
    let currentLines: string[] = [];

    const flushEvent = () => {
      if (currentEvent && currentLines.length > 0) {
        if (!this.events[currentEvent]) {
          this.events[currentEvent] = [];
        }
        this.events[currentEvent].push(...currentLines);
      }
      currentLines = [];
      currentEvent = null;
    };

    for (let line of lines) {
      // Clean comment
      const commentIdx = line.indexOf('//');
      if (commentIdx !== -1) line = line.slice(0, commentIdx);
      const hashIdx = line.indexOf('#');
      if (hashIdx !== -1) line = line.slice(0, hashIdx);

      const trimmed = line.trim();
      if (!trimmed) continue;

      // Satori headers: * OnEventName
      if (trimmed.startsWith('*') || trimmed.startsWith('＠')) {
        flushEvent();
        const header = trimmed.slice(1).trim();
        // Remove spaces inside header name
        currentEvent = header.replace(/\s+/g, '');
      } else if (currentEvent) {
        // Collect dialogue line
        if (trimmed.includes('\\') || trimmed.length > 2) {
          currentLines.push(trimmed);
        }
      }
    }
    flushEvent();

    // YAYA/DIC parser: Extract functions and double-quoted strings robustly
    const funcStartRegex = /(?:^|[\r\n\s;])([A-Za-z0-9_.-]+)(?:\s*:\s*[A-Za-z0-9_.-]+)?\s*\{/g;
    
    let match;
    while ((match = funcStartRegex.exec(content)) !== null) {
      const eventName = match[1];
      const startIndex = match.index + match[0].length;
      
      let depth = 1;
      let endIndex = -1;
      let inString = false;
      let escape = false;
      
      for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      
      if (endIndex === -1) continue;
      
      const body = content.substring(startIndex, endIndex);
      
      const blocks: string[] = [];
      let searchIdx = 0;
      while (searchIdx < body.length) {
        const openBrace = body.indexOf('{', searchIdx);
        if (openBrace === -1) break;
        
        let d = 1;
        let closeBrace = -1;
        let isStr = false;
        let esc = false;
        for (let i = openBrace + 1; i < body.length; i++) {
          const c = body[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') { isStr = !isStr; continue; }
          if (!isStr) {
            if (c === '{') d++;
            else if (c === '}') {
              d--;
              if (d === 0) {
                closeBrace = i;
                break;
              }
            }
          }
        }
        
        if (closeBrace !== -1) {
          blocks.push(body.substring(openBrace + 1, closeBrace));
          searchIdx = closeBrace + 1;
        } else {
          searchIdx = openBrace + 1;
        }
      }
      
      if (blocks.length === 0) {
        blocks.push(body);
      }
      
      const foundScripts: string[] = [];
      const isVariableAssignment = (matchIdx: number, block: string): boolean => {
        let idx = matchIdx - 1;
        while (idx >= 0 && /\s/.test(block[idx])) {
          idx--;
        }
        return idx >= 0 && block[idx] === '=';
      };

      for (const block of blocks) {
        if (block.includes('--')) {
          const parts = block.split('--');
          const groups: string[][] = [];
          
          for (const part of parts) {
            const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
            let strMatch;
            const partStrings: string[] = [];
            while ((strMatch = stringRegex.exec(part)) !== null) {
              if (isVariableAssignment(strMatch.index, part)) {
                continue;
              }
              let cleanStr = strMatch[1];
              cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
              partStrings.push(cleanStr);
            }
            if (partStrings.length > 0) {
              groups.push(partStrings);
            }
          }
          
          if (groups.length > 0) {
            const combos: string[] = [];
            const generate = (gIdx: number, currentStr: string) => {
              if (gIdx === groups.length) {
                combos.push(currentStr);
                return;
              }
              for (const s of groups[gIdx]) {
                generate(gIdx + 1, currentStr + s);
              }
            };
            generate(0, '');
            
            for (const combo of combos) {
              if (combo.includes('\\') || combo.length > 5) {
                foundScripts.push(combo);
              }
            }
          }
        } else {
          const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
          let strMatch;
          while ((strMatch = stringRegex.exec(block)) !== null) {
            if (isVariableAssignment(strMatch.index, block)) {
              continue;
            }
            let cleanStr = strMatch[1];
            cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
            if (cleanStr.includes('\\') || cleanStr.length > 5) {
              foundScripts.push(cleanStr);
            }
          }
        }
      }
      
      if (foundScripts.length > 0) {
        const key = eventName; 
        if (!this.events[key]) {
          this.events[key] = [];
        }
        this.events[key].push(...foundScripts);
      }
      
      funcStartRegex.lastIndex = endIndex + 1;
    }
  }

  private addFallbacks() {
    const addIfMissing = (event: string, scripts: string[]) => {
      if (!this.events[event] || this.events[event].length === 0) {
        this.events[event] = scripts;
      }
    };

    if (this.isJapaneseGhost()) {
      addIfMissing('OnBoot', [
        `\\0\\s[0]こんにちは！また会えたね。\\e`,
        `\\0\\s[0]今日もいい天気だね！\\e`,
      ]);

      addIfMissing('OnFirstBoot', [
        `\\0\\s[0]はじめまして、これからよろしくね！\\e`,
      ]);

      addIfMissing('OnClose', [
        `\\0\\s[0]バイバイ、またね！\\e`,
      ]);

      addIfMissing('OnMouseDoubleClick', [
        `\\0\\s[0]きゃっ！どうしたの？\\e`,
        `\\0\\s[0]なにか用？\\e`,
      ]);

      addIfMissing('OnMouseMove', [
        `\\0\\s[0]なでなでされるの、気持ちいいな。\\e`,
        `\\0\\s[0]くすぐったいよ！\\e`,
      ]);

      addIfMissing('OnUserInput', [
        `\\0\\s[0]「(Reference0)」って言われても、よく分からないな。\\e`,
        `\\0\\s[0]「(Reference0)」について、一緒にお話しする？\\e`,
      ]);
    } else {
      addIfMissing('OnBoot', [
        `\\0\\s[0]반가워! 다시 만나게 되었네.\\e`,
        `\\0\\s[0]오늘도 기분 좋은 하루야!\\e`,
      ]);

      addIfMissing('OnFirstBoot', [
        `\\0\\s[0]안녕? 처음 만나는구나. 잘 부탁해!\\e`,
      ]);

      addIfMissing('OnClose', [
        `\\0\\s[0]잘 가, 다음에 또 봐!\\e`,
      ]);

      addIfMissing('OnMouseDoubleClick', [
        `\\0\\s[0]앗! 왜 때리는 거야?\\e`,
        `\\0\\s[0]무슨 일이야?\\e`,
      ]);

      addIfMissing('OnMouseMove', [
        `\\0\\s[0]헤헤... 쓰다듬어 주니까 기분 좋다.\\e`,
        `\\0\\s[0]간지러워!\\e`,
      ]);

      addIfMissing('OnUserInput', [
        `\\0\\s[0]"(Reference0)"라고? 무슨 뜻인지 모르겠어.\\e`,
        `\\0\\s[0]"(Reference0)"에 대해서 나랑 이야기해 볼래?\\e`,
        `\\0\\s[0]그렇구나... "(Reference0)"인 거네.\\e`,
      ]);
    }
  }

  private getEventScripts(key: string): string[] {
    const exact = this.events[key];
    if (exact && exact.length > 0) return exact;
    
    const lowerKey = key.toLowerCase();
    const lowerMatch = this.events[lowerKey];
    if (lowerMatch && lowerMatch.length > 0) return lowerMatch;
    
    const withEventPrefix = `event.${lowerKey}`;
    const prefixMatch = this.events[withEventPrefix];
    if (prefixMatch && prefixMatch.length > 0) return prefixMatch;

    for (const k of Object.keys(this.events)) {
      const lowerK = k.toLowerCase();
      if (lowerK === lowerKey || lowerK === withEventPrefix) {
        return this.events[k];
      }
    }
    return [];
  }

  /**
   * Dispatches an event to the virtual SHIORI engine and returns a SakuraScript string.
   */
  public trigger(event: string, refParts: string[] = []): string {
    console.log(`[ShioriRunner] Trigger event: ${event}`, refParts);

    let scriptList: string[] = [];

    if (event === 'OnSecondChange') {
      scriptList = this.getEventScripts('OnSecondChange');
    } else if (event === 'OnRandomTalk') {
      scriptList = this.randomTalks;
    } else if (event === 'OnBoot') {
      // Boot category time-based check
      const hour = new Date().getHours();
      const categories: string[] = [];
      if (hour >= 0 && hour < 5) {
        categories.push('midnight');
      } else if (hour >= 5 && hour < 9) {
        categories.push('earlymornig', 'earlymorning', 'morning');
      } else if (hour >= 9 && hour < 17) {
        categories.push('day');
      } else if (hour >= 17 && hour < 19) {
        categories.push('evening');
      } else {
        categories.push('night');
      }

      for (const cat of categories) {
        let scripts = this.getEventScripts(`another.talkbootup${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`talkbootup${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`ntalkbootup${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`n.talkbootup${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }

      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkbootup');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('ntalkbootup');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkbootup');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkfirstboot');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnBoot');
      }
    } else if (event === 'OnClose') {
      // Close category time-based check
      const hour = new Date().getHours();
      const categories: string[] = [];
      if (hour >= 0 && hour < 5) {
        categories.push('midnight');
      } else if (hour >= 5 && hour < 9) {
        categories.push('earlymorning', 'morning');
      } else if (hour >= 9 && hour < 17) {
        categories.push('day');
      } else if (hour >= 17 && hour < 19) {
        categories.push('evening');
      } else {
        categories.push('night');
      }

      for (const cat of categories) {
        let scripts = this.getEventScripts(`another.talkclose${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`talkclose${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`ntalkclose${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`n.talkclose${cat}`);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }

      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkclose');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('ntalkclose');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkclose');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnClose');
      }
    } else if (event === 'OnFirstBoot') {
      scriptList = this.getEventScripts('talkfirstboot');
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkfirstboot');
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnFirstBoot');
      }
    } else if (event === 'OnUserInput') {
      const customScripts = this.getEventScripts('OnUserInput');
      const isFallback = customScripts.length > 0 && customScripts[0].includes('"(Reference0)"라고?');
      if (this.randomTalks.length > 0 && (customScripts.length === 0 || isFallback)) {
        scriptList = this.randomTalks;
      } else {
        scriptList = customScripts;
      }
    } else {
      scriptList = this.getEventScripts(event);
    }

    // Specific coordinate-based double click overrides
    if (event === 'OnMouseDoubleClick' && refParts.length >= 4) {
      // refParts: [x, y, characterScope, collisionLabel]
      const scope = refParts[2];
      const label = refParts[3];
      const labelLower = label.toLowerCase();
      const scopeNum = parseInt(scope, 10);
      
      const searchKeys = [
        `another.character${scope}doubleclick.${labelLower}`,
        `character${scope}doubleclick.${labelLower}`,
        `another.character${scope}doubleclick`,
        `character${scope}doubleclick`,
        `onmousedoubleclick${label}`,
      ];

      // Add Kawari-style click handlers
      if (scopeNum === 0) {
        if (labelLower) {
          searchKeys.push(`talksakura${labelLower}click`);
        }
        searchKeys.push(`talksakuraclick`);
      } else if (scopeNum === 1) {
        if (labelLower) {
          searchKeys.push(`talkkero${labelLower}click`);
        }
        searchKeys.push(`talkkeroclick`);
      }

      for (const key of searchKeys) {
        const scripts = this.getEventScripts(key);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }
    }

    // Specific coordinate-based single click overrides
    if (event === 'OnMouseClick' && refParts.length >= 4) {
      const scope = refParts[2];
      const label = refParts[3];
      const labelLower = label.toLowerCase();
      const scopeNum = parseInt(scope, 10);
      
      const searchKeys = [
        `another.character${scope}singleclick.${labelLower}`,
        `character${scope}singleclick.${labelLower}`,
        `another.character${scope}singleclick`,
        `character${scope}singleclick`,
        `anohter.character${scope}singleclick.${labelLower}`, // handle potential legacy typos in scripts
        `onmouseclick${label}`,
      ];

      // Add Kawari-style click handlers
      if (scopeNum === 0) {
        if (labelLower) {
          searchKeys.push(`talksakura${labelLower}click`);
        }
        searchKeys.push(`talksakuraclick`);
      } else if (scopeNum === 1) {
        if (labelLower) {
          searchKeys.push(`talkkero${labelLower}click`);
        }
        searchKeys.push(`talkkeroclick`);
      }

      for (const key of searchKeys) {
        const scripts = this.getEventScripts(key);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }
    }

    // Specific mouse rub/stroke overrides
    if (event === 'OnMouseMove' && refParts.length >= 4) {
      const scope = refParts[2];
      const label = refParts[3].toLowerCase();
      
      const coreKeys = [
        `another.character${scope}stroke.${label}`,
        `character${scope}stroke.${label}`,
        `another.character${scope}stroke`,
        `character${scope}stroke`,
        `onmousemove${refParts[3]}`,
      ];

      let targetKey = '';
      for (const key of coreKeys) {
        const scripts = this.getEventScripts(key);
        if (scripts.length > 0) {
          targetKey = key;
          scriptList = scripts;
          break;
        }
      }

      if (targetKey) {
        const limitKeys = [
          `another.limit.character${scope}stroke.${label}`,
          `limit.character${scope}stroke.${label}`,
          `another.limit.character${scope}stroke`,
          `limit.character${scope}stroke`,
        ];

        let limit = 40; // Default stroke limit
        for (const limitKey of limitKeys) {
          const limitScripts = this.getEventScripts(limitKey);
          if (limitScripts.length > 0) {
            const parsedLimit = parseInt(limitScripts[0], 10);
            if (!isNaN(parsedLimit)) {
              limit = parsedLimit;
              break;
            }
          }
        }

        const countKey = `${scope}.${label}`;
        this.strokeCounts[countKey] = (this.strokeCounts[countKey] || 0) + 1;

        const halfLimit = Math.floor(limit / 2);
        if (this.strokeCounts[countKey] === halfLimit && halfLimit > 0) {
          const halfScripts = this.getEventScripts(`${targetKey}.half`);
          if (halfScripts.length > 0) {
            scriptList = halfScripts;
          } else {
            return '';
          }
        } else if (this.strokeCounts[countKey] >= limit) {
          this.strokeCounts[countKey] = 0;
          // scriptList is already targetKey scripts
        } else {
          return '';
        }
      } else {
        return '';
      }
    }

    if (event === 'OnChoiceSelect' && refParts.length > 0) {
      const choiceId = refParts[0];
      const scripts = this.getEventScripts(choiceId);
      if (scripts.length > 0) {
        scriptList = scripts;
      } else {
        return this.isJapaneseGhost()
          ? `\\0\\s[0]選択肢 ${choiceId} を選んだよ。\\e`
          : `\\0\\s[0]선택지 ${choiceId}를 눌렀어.\\e`;
      }
    }

    if (scriptList.length === 0) {
      // Prevent mouse and second events from falling back to OnBoot
      if (
        event === 'OnSecondChange' ||
        event === 'OnMouseMove' ||
        event === 'OnMouseClick' ||
        event === 'OnMouseDoubleClick'
      ) {
        return '';
      }
      scriptList = this.getEventScripts(event);
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnBoot');
      }
    }

    // Pick a random script
    const randomIndex = Math.floor(Math.random() * scriptList.length);
    let script = scriptList[randomIndex] || '';

    // Apply template replacements
    script = this.replaceVariables(script, refParts);

    return script;
  }

  private replaceVariables(script: string, refParts: string[] = []): string {
    let result = script;
    
    // Replace references: (Reference0) or (ref0) or (Reference1)...
    refParts.forEach((part, idx) => {
      const refRegex = new RegExp(`\\(Reference${idx}\\)`, 'gi');
      result = result.replace(refRegex, part);
      const refRegexShort = new RegExp(`\\(ref${idx}\\)`, 'gi');
      result = result.replace(refRegexShort, part);
    });
    
    // Replace Satori / Ukagaka placeholders
    result = result.replace(/\(username\)/gi, this.userName);
    result = result.replace(/\(user\)/gi, this.userName);
    result = result.replace(/\(owner\)/gi, this.userName);
    result = result.replace(/\(주인\)/g, this.userName);
    result = result.replace(/\(사용자\)/g, this.userName);
    result = result.replace(/%username/gi, this.userName);

    // Replace character names
    result = result.replace(/\(sakuraname\)/gi, this.metadata.sakuraName);
    result = result.replace(/\(keroname\)/gi, this.metadata.keroName);
    result = result.replace(/%sakuraname/gi, this.metadata.sakuraName);
    result = result.replace(/%keroname/gi, this.metadata.keroName);
    result = result.replace(/%selfname/gi, this.metadata.sakuraName);

    // Replace Kawari-style ${variable} placeholders
    if (this.isJapaneseGhost()) {
      result = result.replace(/\$\{n-gs\}/gi, 'あいつ');
      result = result.replace(/\$\{unyu1\}/gi, 'うにゅー');
      result = result.replace(/\$\{unyu\}/gi, 'うにゅ');
    } else {
      result = result.replace(/\$\{n-gs\}/gi, '그 녀석');
      result = result.replace(/\$\{unyu1\}/gi, '우뉴-');
      result = result.replace(/\$\{unyu\}/gi, '우뉴');
    }
    result = result.replace(/\$\{0\}/gi, '');
    result = result.replace(/\$\{[A-Za-z0-9_-]+\}/gi, '');

    return result;
  }

  public getMetadata(): GhostMetadata {
    return this.metadata;
  }

  private parseKawari(content: string) {
    const lines = content.split(/\r?\n/);
    for (let line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();

      if (!val) continue;

      let cleanVal = val;
      const commentIdx = val.indexOf('#');
      if (commentIdx !== -1) cleanVal = val.slice(0, commentIdx).trim();
      const slashCommentIdx = cleanVal.indexOf('//');
      if (slashCommentIdx !== -1) cleanVal = cleanVal.slice(0, slashCommentIdx).trim();

      if (!cleanVal) continue;

      // Filter out Kawari code expressions (starts with $ or contains $() )
      if (cleanVal.startsWith('$') || cleanVal.includes('$(')) {
        continue;
      }

      // Save all keys in case they map to events
      if (!this.events[key]) {
        this.events[key] = [];
      }
      this.events[key].push(cleanVal);

      // Only parse random talk sentences (keys starting with sentence)
      if (key.startsWith('sentence')) {
        this.randomTalks.push(cleanVal);
      }
    }
  }
}
