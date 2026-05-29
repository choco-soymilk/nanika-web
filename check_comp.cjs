const fs = require('fs');
const JSZip = require('jszip');

async function checkCompressionHeader() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const file = zip.file('ghost/master/eseai_talk.dic');
  const buf = await file.async('nodebuffer');
  const seed = buf[9];
  
  const decrypted = Buffer.alloc(buf.length - 16);
  for (let i = 16; i < buf.length; i++) {
    const p = i - 16;
    let val = (buf[i] - seed - p * 5) % 256;
    if (val < 0) val += 256;
    decrypted[p] = val;
  }
  
  console.log('Decrypted header (first 32 bytes):');
  console.log(decrypted.slice(0, 32).toString('hex'));
  console.log('Ascii:', decrypted.slice(0, 32).toString('ascii'));
  
  // Let's print bytes starting from index 16 of the decrypted buffer
  console.log('\nDecrypted bytes from index 16 (hex):');
  console.log(decrypted.slice(16, 48).toString('hex'));
}

checkCompressionHeader().catch(console.error);
