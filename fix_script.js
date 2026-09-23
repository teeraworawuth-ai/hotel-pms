const fs = require('fs');
let c = fs.readFileSync('patch_options_icons4.js', 'utf8');

c = c.replace('const optionUI = `</div>', 'const optionUI = `</div>\\n                  </div>');

fs.writeFileSync('patch_options_icons5.js', c, 'utf8');
console.log('Fixed script');
