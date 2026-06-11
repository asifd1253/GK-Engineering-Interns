const fs = require('fs');
const xml = fs.readFileSync('d:\\work\\Wimerra\\InvApp\\Final\\all\\backend\\enhancement_extracted\\word\\document2.xml', 'utf8');
const text = xml.replace(/<[^>]+>/g, ' ');
fs.writeFileSync('d:\\work\\Wimerra\\InvApp\\Final\\all\\backend\\enhancement_text.txt', text);
