const fs = require('fs');
let code = fs.readFileSync('src/app/layout.tsx', 'utf8');

// Find the title and add a version tag
if (code.includes('>Hotel PMS<')) {
  code = code.replace(
    />Hotel PMS</,
    '>Hotel PMS <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full align-middle ml-2">v2.1</span><'
  );
  fs.writeFileSync('src/app/layout.tsx', code, 'utf8');
}