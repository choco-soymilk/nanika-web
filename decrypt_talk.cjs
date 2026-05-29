const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function decryptTalkDic() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const file = zip.file('ghost/master/eseai_talk.dic');
  if (!file) {
    console.error('File not found!');
    return;
  }
  
  const buf = await file.async('nodebuffer');
  const seed = buf[9];
  console.log('Deciphering eseai_talk.dic with seed:', seed);
  
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

decryptTalkDic().catch(console.error);
