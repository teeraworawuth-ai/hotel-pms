const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('const [voidPin, setVoidPin] = useState'));
lines.splice(idx + 1, 0, 
  "  const [extrasManagerUnlocked, setExtrasManagerUnlocked] = useState(false);",
  "  const [extrasManagerName, setExtrasManagerName] = useState('');",
  "  const [extrasEditNote, setExtrasEditNote] = useState('');",
  "  const [showExtrasPinPrompt, setShowExtrasPinPrompt] = useState(false);",
  "  const [extrasPin, setExtrasPin] = useState('');",
  "  const [extrasPinError, setExtrasPinError] = useState('');"
);
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed states');
