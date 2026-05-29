const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function testDecrypt() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const file = zip.file('ghost/master/eseai_c_italk.dic');
  if (!file) {
    console.error('File not found!');
    return;
  }
  
  const buf = await file.async('nodebuffer');
  
  // Try absolute index
  const decryptedAbs = Buffer.alloc(buf.length - 16);
  for (let i = 16; i < buf.length; i++) {
    // P_i = (E_i - i * 5) % 256
    let val = (buf[i] - i * 5) % 256;
    if (val < 0) val += 256;
    decryptedAbs[i - 16] = val;
  }
  
  // Try relative index
  const decryptedRel = Buffer.alloc(buf.length - 16);
  for (let i = 16; i < buf.length; i++) {
    const j = i - 16;
    let val = (buf[i] - j * 5) % 256;
    if (val < 0) val += 256;
    decryptedRel[j] = val;
  }
  
  console.log('Absolute index decryption (EUC-KR):');
  try {
    const text = new TextDecoder('euc-kr').decode(decryptedAbs);
    console.log(text.slice(0, 1000));
  } catch (e) {
    console.log('Failed:', e.message);
  }
  
  console.log('\nRelative index decryption (EUC-KR):');
  try {
    const text = new TextDecoder('euc-kr').decode(decryptedRel);
    console.log(text.slice(0, 1000));
  } catch (e) {
    console.log('Failed:', e.message);
  }
}

testDecrypt().catch(console.error);
