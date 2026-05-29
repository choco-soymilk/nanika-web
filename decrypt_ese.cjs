const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function decryptEseShiori() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const file = zip.file('ghost/master/eseai_c_italk.dic');
  if (!file) {
    console.error('File not found!');
    return;
  }
  
  const buf = await file.async('nodebuffer');
  
  // Seed is the byte at index 9
  const seed = buf[9];
  console.log('Detected seed:', seed);
  
  const decrypted = Buffer.alloc(buf.length - 16);
  for (let i = 16; i < buf.length; i++) {
    const p = i - 16;
    let val = (buf[i] - seed - p * 5) % 256;
    if (val < 0) val += 256;
    decrypted[p] = val;
  }
  
  console.log('\nDecrypted text (EUC-KR):');
  try {
    const text = new TextDecoder('euc-kr').decode(decrypted);
    console.log(text.slice(0, 1500));
  } catch (e) {
    console.log('EUC-KR decode failed:', e.message);
  }
}

decryptEseShiori().catch(console.error);
