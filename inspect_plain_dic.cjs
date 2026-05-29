const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function inspectPlainDic() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\nisesakura_rebirth2_008.zip';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const files = [
    'ghost/master/eseai_dictionary.dic',
    'ghost/master/eseai_resp.dic',
    'ghost/master/eseai_talk.dic',
    'ghost/master/eseai_teach.dic',
    'ghost/master/eseai_user.dic',
    'ghost/master/eseai_EECE_core.dic',
    'ghost/master/eseai_EECE_script.dic'
  ];
  
  for (const path of files) {
    const file = zip.file(path);
    if (!file) {
      console.log(`\nPath: ${path} - NOT FOUND`);
      continue;
    }
    const buf = await file.async('nodebuffer');
    console.log(`\nPath: ${path}`);
    console.log('Size:', buf.length);
    
    // Check if it starts with ESESHIORI
    const isEseShiori = buf.slice(0, 9).toString('utf-8') === 'ESESHIORI';
    console.log('Starts with ESESHIORI?', isEseShiori);
    
    if (isEseShiori) {
      console.log('Hex dump (first 32 bytes):', buf.slice(0, 32).toString('hex'));
    } else {
      console.log('Sample text (EUC-KR):');
      try {
        console.log(new TextDecoder('euc-kr').decode(buf).slice(0, 400));
      } catch (e) {
        console.log('Failed to decode EUC-KR:', e.message);
      }
    }
  }
}

inspectPlainDic().catch(console.error);
