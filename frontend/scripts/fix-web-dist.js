const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

let changed = 0;

const indexPath = path.join(distDir, 'index.html');
if (replaceInFile(indexPath, [
  ['href="/', 'href="./'],
  ['src="/', 'src="./'],
])) {
  changed += 1;
}

const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
if (fs.existsSync(jsDir)) {
  for (const fileName of fs.readdirSync(jsDir)) {
    if (!fileName.endsWith('.js')) continue;
    const filePath = path.join(jsDir, fileName);
    if (replaceInFile(filePath, [
      ['"/assets/', '"./assets/'],
      ["'/assets/", "'./assets/"],
    ])) {
      changed += 1;
    }
  }
}

const cssDir = path.join(distDir, '_expo', 'static', 'css');
if (fs.existsSync(cssDir)) {
  for (const fileName of fs.readdirSync(cssDir)) {
    if (!fileName.endsWith('.css')) continue;
    const filePath = path.join(cssDir, fileName);
    if (replaceInFile(filePath, [
      ['url(/assets/', 'url(./assets/'],
      ['url("/assets/', 'url("./assets/'],
      ["url('/assets/", "url('./assets/"],
    ])) {
      changed += 1;
    }
  }
}

console.log(`Fixed web dist asset paths in ${changed} file(s).`);
