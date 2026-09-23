const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace(/>\s*\{icon\}\s*<\/button>/g, '>\n                              {renderIcon(icon, "w-5 h-5 text-slate-700")}\n                            </button>');

fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Fixed icon render in settings');
