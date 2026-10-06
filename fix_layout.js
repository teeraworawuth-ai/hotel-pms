const fs = require('fs');
let content = fs.readFileSync('src/app/layout.tsx', 'utf8');

if (!content.includes('AuthGuard')) {
  content = content.replace('import Navbar from "./components/Navbar";', 'import Navbar from "./components/Navbar";\nimport AuthGuard from "./components/AuthGuard";');
  content = content.replace('<body className="flex flex-col min-h-screen">', '<body className="flex flex-col min-h-screen">\n        <AuthGuard>');
  content = content.replace('</body>', '        </AuthGuard>\n      </body>');
  fs.writeFileSync('src/app/layout.tsx', content, 'utf8');
  console.log('Updated layout');
}
