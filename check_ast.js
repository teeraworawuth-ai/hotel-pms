const babel = require('@babel/core');
const fs = require('fs');
const content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// We have to remove the last } so it parses successfully? 
// No, Babel might fail if there's a syntax error.
try {
  const ast = babel.parse(content, {
    filename: 'src/app/components/RoomCheckinModal.tsx',
    presets: ['@babel/preset-typescript', '@babel/preset-react']
  });
  const fn = ast.program.body.find(n => n.type === 'ExportDefaultDeclaration');
  console.log('Function starts at', fn.loc.start.line, 'and ends at', fn.loc.end.line);
} catch (e) {
  console.error('Babel error:', e.message);
}
