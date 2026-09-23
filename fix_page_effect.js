const fs = require('fs');
let code = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');
code = code.replace(/      };\n  }, \[\]\);/g, '      };\n  }, [simulatedTime]);');
fs.writeFileSync('src/app/checkin/page.tsx', code);
console.log('Fixed page useEffect dependency');
