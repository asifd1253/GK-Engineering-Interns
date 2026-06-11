const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");
let html = fs.readFileSync(indexPath, "utf8");

html = html
  .replaceAll('href="/_expo/', 'href="./_expo/')
  .replaceAll('src="/_expo/', 'src="./_expo/')
  .replaceAll('href="/favicon.ico"', 'href="./favicon.ico"');

fs.writeFileSync(indexPath, html);

