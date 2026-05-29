const fs = require('fs');
const JSZip = require('jszip');
const { TextDecoder } = require('util');

async function inspectEucKr() {
  const filePath = 'C:\\Users\\choms\\OneDrive\\Escritorio\\app development\\ghost\\hortense.nar';
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  
  const descriptFile = zip.file('ghost/master/descript.txt');
  const aitalkFile = zip.file('ghost/master/Hor_aitalk.dic');
  const bootendFile = zip.file('ghost/master/Hor_bootend.dic');
  
  if (descriptFile) {
    const ab = await descriptFile.async('nodebuffer');
    console.log('descript.txt (EUC-KR):');
    console.log(new TextDecoder('euc-kr').decode(ab));
  }
  
  if (aitalkFile) {
    const ab = await aitalkFile.async('nodebuffer');
    console.log('\nHor_aitalk.dic (EUC-KR):');
    console.log(new TextDecoder('euc-kr').decode(ab).slice(0, 1500));
  }

  if (bootendFile) {
    const ab = await bootendFile.async('nodebuffer');
    console.log('\nHor_bootend.dic (EUC-KR):');
    console.log(new TextDecoder('euc-kr').decode(ab).slice(0, 1500));
  }
}

inspectEucKr().catch(console.error);
