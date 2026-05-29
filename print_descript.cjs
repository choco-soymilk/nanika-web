const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function printDescript() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const descriptFile = zip.file('ghost/master/descript.txt');
  if (descriptFile) {
    const ab = await descriptFile.async('nodebuffer');
    console.log('descript.txt (EUC-KR):');
    console.log(new TextDecoder('euc-kr').decode(ab));
  } else {
    console.error('descript.txt not found');
  }

  // Also print all files in the ghost/master/ directory
  console.log('\nFiles in ghost/master/:');
  zip.forEach((path) => {
    if (path.includes('ghost/master/')) {
      console.log('  ' + path);
    }
  });
}

printDescript().catch(console.error);
