const fs = require('fs');
let content = fs.readFileSync('src/app/components/ShiftManager.tsx', 'utf8');

// Change initialCash and finalCash types
content = content.replace(
  'const [initialCash, setInitialCash] = useState(0);',
  'const [initialCash, setInitialCash] = useState<number | \'\'>(0);'
);
content = content.replace(
  'const [finalCash, setFinalCash] = useState(0);',
  'const [finalCash, setFinalCash] = useState<number | \'\'>(0);'
);

// Update onChange for initialCash
content = content.replace(
  'onChange={(e) => setInitialCash(Number(e.target.value))}',
  'onChange={(e) => setInitialCash(e.target.value === \'\' ? \'\' : Number(e.target.value))}'
);

// Update onChange for finalCash
content = content.replace(
  'onChange={(e) => setFinalCash(Number(e.target.value))}',
  'onChange={(e) => setFinalCash(e.target.value === \'\' ? \'\' : Number(e.target.value))}'
);

fs.writeFileSync('src/app/components/ShiftManager.tsx', content);
console.log("Updated ShiftManager");
