const fs = require('fs');
let code = fs.readFileSync('src/app/components/Navbar.tsx', 'utf8');
code = code.replace(/v3\.\d+/, 'v3.3');
fs.writeFileSync('src/app/components/Navbar.tsx', code);
