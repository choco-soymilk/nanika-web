const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

function isVariableAssignment(matchIndex, matchStr, block) {
  let i = matchIndex - 1;
  while (i >= 0 && /\s/.test(block[i])) {
    i--;
  }
  if (i >= 0 && block[i] === '=') {
    return true;
  }
  return false;
}

function parseDictionaryRobust(content) {
  const events = {};
  
  // Find function starts
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
    
    const blocks = [];
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
    
    const foundScripts = [];
    
    for (const block of blocks) {
      if (block.includes('--')) {
        const parts = block.split('--');
        const groups = [];
        
        for (const part of parts) {
          const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
          let strMatch;
          const partStrings = [];
          while ((strMatch = stringRegex.exec(part)) !== null) {
            let cleanStr = strMatch[1];
            cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
            
            // Filter out variable assignments
            if (isVariableAssignment(strMatch.index, strMatch[0], part)) {
              continue;
            }
            
            partStrings.push(cleanStr);
          }
          if (partStrings.length > 0) {
            groups.push(partStrings);
          }
        }
        
        if (groups.length > 0) {
          const combos = [];
          const generate = (gIdx, currentStr) => {
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
          let cleanStr = strMatch[1];
          cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
          
          if (isVariableAssignment(strMatch.index, strMatch[0], block)) {
            continue;
          }
          
          if (cleanStr.includes('\\') || cleanStr.length > 5) {
            foundScripts.push(cleanStr);
          }
        }
      }
    }
    
    if (foundScripts.length > 0) {
      const key = eventName.toLowerCase();
      if (!events[key]) {
        events[key] = [];
      }
      events[key].push(...foundScripts);
    }
    
    funcStartRegex.lastIndex = endIndex + 1;
  }
  
  return events;
}

async function test() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\hortense.nar';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const aitalkFile = zip.file('ghost/master/Hor_aitalk.dic');
  const ab = await aitalkFile.async('nodebuffer');
  const content = new TextDecoder('euc-kr').decode(ab);
  const parsed = parseDictionaryRobust(content);
  
  console.log('--- Combined Dialogues from Hor_aitalk.dic (Filtered variable assignments) ---');
  for (const [key, val] of Object.entries(parsed)) {
    console.log(`Event: ${key} (${val.length} strings)`);
    console.log('Sample dialogues:');
    val.slice(0, 5).forEach((d, idx) => {
      console.log(`  [${idx}] ${d.replace(/\r?\n/g, '\\n')}`);
    });
  }
}

test().catch(console.error);
