const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function inspect() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\ddalgi-choms84.nar';
  console.log('Reading file:', filePath);
  
  if (!fs.existsSync(filePath)) {
    console.error('File does not exist!');
    return;
  }
  
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  console.log('Zip loaded. Total files:', Object.keys(zip.files).length);
  
  let installFile = null;
  let descriptFile = null;
  
  zip.forEach((relativePath, file) => {
    const lower = relativePath.toLowerCase();
    if (lower.endsWith('install.txt')) {
      installFile = file;
    } else if (lower.endsWith('ghost/master/descript.txt')) {
      descriptFile = file;
    }
  });
  
  console.log('install.txt found?', !!installFile);
  console.log('descript.txt found?', !!descriptFile);
  
  if (descriptFile) {
    const arrayBuffer = await descriptFile.async('nodebuffer');
    console.log('\ndescript.txt in utf-8:');
    try {
      console.log(new TextDecoder('utf-8').decode(arrayBuffer).slice(0, 500));
    } catch (e) {
      console.log('UTF-8 decode failed');
    }
    console.log('\ndescript.txt in shift-jis:');
    try {
      console.log(new TextDecoder('shift-jis').decode(arrayBuffer).slice(0, 500));
    } catch (e) {
      console.log('Shift-JIS decode failed');
    }
    console.log('\ndescript.txt in euc-kr:');
    try {
      console.log(new TextDecoder('euc-kr').decode(arrayBuffer).slice(0, 500));
    } catch (e) {
      console.log('EUC-KR decode failed');
    }
  }

  // Find other .txt / .dic files
  const textFiles = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.includes('ghost/master/') && (relativePath.endsWith('.txt') || relativePath.endsWith('.dic') || relativePath.endsWith('.ini'))) {
      textFiles.push(relativePath);
    }
  });
  console.log('\nText files under ghost/master/:');
  console.log(textFiles);

  // Search all files for boot events
  for (const path of textFiles) {
    const file = zip.file(path);
    if (!file) continue;
    const arrayBuffer = await file.async('nodebuffer');
    const content = new TextDecoder('euc-kr').decode(arrayBuffer);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (lower.includes('onboot') || lower.includes('onfirstboot') || lower.includes('boot') || lower.includes('firstboot')) {
        console.log(`[${path}:${index + 1}] ${line}`);
      }
    });
  }
}

inspect().catch(console.error);
