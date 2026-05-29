const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createMockNar() {
  const zip = new JSZip();

  // 1x1 transparent PNG base64
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  // Files in the archive
  zip.file('install.txt', 'charset,utf-8\nname,Test Mascot\ntype,ghost\ndirectory,test_mascot\n');
  zip.file('ghost/master/descript.txt', 'charset,utf-8\nname,Test Mascot\nsakura.name,Strawberry Ghost\nkero.name,Choco Ghost\n');
  zip.file('ghost/master/aitalk.txt', '\\0\\s[0]오늘 기분이 아주 좋아!\\e\n\\0\\s[0]노래를 불러볼까?\\e\n');
  zip.file(
    'ghost/master/satori.txt',
    '* OnBoot\n\\0\\s[0]시스템 부팅 완료!\\e\n\n* OnMouseDoubleClickHead\n\\0\\s[1]머리를 콕 찌르지 마!\\e\n\n* OnMouseMoveBody\n\\0\\s[2]쓰다듬어 줘서 고마워.\\e\n'
  );
  
  zip.file('shell/master/descript.txt', 'name,Test Shell\n');
  zip.file(
    'shell/master/surfaces.txt',
    'surface0\n{\n  element0,base,surface0.png,0,0\n  collision0,0,0,100,100,Head\n  collision1,0,100,100,200,Body\n}\nsurface1\n{\n  element0,base,surface1.png,0,0\n}\nsurface2\n{\n  element0,base,surface2.png,0,0\n}\n'
  );

  zip.file('shell/master/surface0.png', pngBuffer);
  zip.file('shell/master/surface1.png', pngBuffer);
  zip.file('shell/master/surface2.png', pngBuffer);

  const destPath = path.join(__dirname, 'test_ghost.nar');
  console.log('Writing mock NAR to:', destPath);
  const content = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(destPath, content);
  console.log('Mock NAR created successfully.');
}

createMockNar().catch(console.error);
