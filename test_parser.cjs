const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

function parseDictionaryRobust(content) {
  const events = {};
  
  // Find function starts: Name followed by optional : option, then {
  // e.g. "OnFirstBoot {", "RandomTalk : nonoverlap {"
  const funcStartRegex = /(?:^|[\r\n\s;])([A-Za-z0-9_.-]+)(?:\s*:\s*[A-Za-z0-9_.-]+)?\s*\{/g;
  
  let match;
  while ((match = funcStartRegex.exec(content)) !== null) {
    const eventName = match[1];
    const startIndex = match.index + match[0].length; // Index after the opening '{'
    
    // Find matching closing '}' by scanning forward and counting brace depth
    let depth = 1;
    let endIndex = -1;
    let inString = false;
    let escape = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (char === '\\') {
        escape = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }
    
    if (endIndex === -1) {
      // No matching closing brace, skip or consume rest of file
      continue;
    }
    
    const body = content.substring(startIndex, endIndex);
    
    // Extract double-quoted strings from body
    const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let strMatch;
    const foundStrings = [];
    while ((strMatch = stringRegex.exec(body)) !== null) {
      let cleanStr = strMatch[1];
      // Unescape double backslashes and escaped quotes
      cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
      if (cleanStr.includes('\\') || cleanStr.length > 3) {
        foundStrings.push(cleanStr);
      }
    }
    
    if (foundStrings.length > 0) {
      const key = eventName; // Keep case-sensitive or standard case
      if (!events[key]) {
        events[key] = [];
      }
      events[key].push(...foundStrings);
    }
    
    // Advance regex search index to after the closing brace
    funcStartRegex.lastIndex = endIndex + 1;
  }
  
  return events;
}

async function test() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\hortense.nar';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const aitalkFile = zip.file('ghost/master/Hor_aitalk.dic');
  const bootendFile = zip.file('ghost/master/Hor_bootend.dic');
  
  if (aitalkFile) {
    const ab = await aitalkFile.async('nodebuffer');
    const content = new TextDecoder('euc-kr').decode(ab);
    const parsed = parseDictionaryRobust(content);
    console.log('--- Parsed from Hor_aitalk.dic ---');
    for (const [key, val] of Object.entries(parsed)) {
      console.log(`Event: ${key} (${val.length} strings)`);
      console.log('Sample:', val.slice(0, 3));
    }
  }

  if (bootendFile) {
    const ab = await bootendFile.async('nodebuffer');
    const content = new TextDecoder('euc-kr').decode(ab);
    const parsed = parseDictionaryRobust(content);
    console.log('\n--- Parsed from Hor_bootend.dic ---');
    for (const [key, val] of Object.entries(parsed)) {
      console.log(`Event: ${key} (${val.length} strings)`);
      console.log('Sample:', val.slice(0, 3));
    }
  }
}

test().catch(console.error);
