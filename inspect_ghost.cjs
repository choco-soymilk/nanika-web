const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function inspect() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\hortense.nar';
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

  // Let's print a sample of some dictionaries to see their format
  for (const path of textFiles.slice(0, 5)) {
    const file = zip.file(path);
    const arrayBuffer = await file.async('nodebuffer');
    // Try shift-jis first
    let decoded = '';
    try {
      decoded = new TextDecoder('shift-jis').decode(arrayBuffer);
    } catch (e) {
      decoded = new TextDecoder('utf-8').decode(arrayBuffer);
    }
    console.log(`\n--- Sample from ${path} (decrypted/decoded) ---`);
    console.log(decoded.slice(0, 800));
    console.log('-----------------------------------------------\n');
  }
}

inspect().catch(console.error);
