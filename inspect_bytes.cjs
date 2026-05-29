const fs = require('fs');
const JSZip = require('jszip');

async function inspectBytes() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const files = [
    'ghost/master/eseai_c_flue.dic',
    'ghost/master/eseai_c_italk.dic',
    'ghost/master/eseai_c_u_tip.dic',
  ];
  
  for (const path of files) {
    const file = zip.file(path);
    if (!file) continue;
    const buf = await file.async('nodebuffer');
    console.log(`\nPath: ${path}`);
    console.log('Size:', buf.length);
    console.log('Hex dump (first 128 bytes):');
    let hex = '';
    let chars = '';
    for (let i = 0; i < Math.min(buf.length, 128); i++) {
      const b = buf[i];
      hex += b.toString(16).padStart(2, '0') + ' ';
      chars += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      if ((i + 1) % 16 === 0) {
        console.log(`${hex.padEnd(48)} | ${chars}`);
        hex = '';
        chars = '';
      }
    }
    if (hex) {
      console.log(`${hex.padEnd(48)} | ${chars}`);
    }
  }
}

inspectBytes().catch(console.error);
