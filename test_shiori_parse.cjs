const fs = require('fs');
const JSZip = require('jszip');

// Mock TextDecoder in node if needed (already standard in Node 11+)
const { TextDecoder } = require('util');
global.TextDecoder = TextDecoder;

// Read the implementation files directly or mock their behavior
async function test() {
  const fileBuffer = fs.readFileSync('public/sakura_r030103b.zip');
  
  // Let's implement the logic of NarExtractor.extract and ShioriRunner.parseGhost
  const zip = await JSZip.loadAsync(fileBuffer);
  
  // Charset detection
  let detectedCharset = 'shift-jis'; // as we know it maps to Shift-JIS

  const files = {};
  for (const [relativePath, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir) continue;
    
    const virtualFile = {
      name: relativePath.split('/').pop(),
      path: relativePath
    };
    
    if (relativePath.endsWith('.txt') || relativePath.endsWith('.dic') || relativePath.endsWith('.ini')) {
      const buf = await fileObj.async('nodebuffer');
      virtualFile.text = new TextDecoder(detectedCharset).decode(buf);
    }
    files[relativePath] = virtualFile;
  }

  // Now, let's trace the parsing of dict-ai2.txt
  console.log('Total files extracted:', Object.keys(files).length);
  
  const randomTalks = [];
  const events = {};

  const parseKawari = (content) => {
    const lines = content.split(/\r?\n/);
    let count = 0;
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

      if (cleanVal.startsWith('$') || cleanVal.includes('$(')) {
        continue;
      }

      if (key.startsWith('sentence')) {
        randomTalks.push(cleanVal);
        count++;
      }
    }
    return count;
  };

  for (const [path, file] of Object.entries(files)) {
    if (!path.includes('ghost/master/')) continue;
    if (!file.text) continue;
    const count = parseKawari(file.text);
    if (count > 0) {
      console.log(`Parsed ${count} sentences from ${path}`);
    }
  }

  console.log('Total randomTalks parsed:', randomTalks.length);
  if (randomTalks.length > 0) {
    console.log('Sample randomTalk:', randomTalks[0]);
  }
}

test().catch(console.error);
