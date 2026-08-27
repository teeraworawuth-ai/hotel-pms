const fs = require('fs');
let content = fs.readFileSync('src/app/components/TuyaApiSettings.tsx', 'utf8');

content = content.replace(
  '<TuyaQuotaWidget />\n    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">',
  '<>\n      <TuyaQuotaWidget />\n      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">'
);

content = content.replace(
  '    </div>\n  );\n}',
  '    </div>\n    </>\n  );\n}'
);

fs.writeFileSync('src/app/components/TuyaApiSettings.tsx', content);
console.log('Fixed JSX syntax error');
