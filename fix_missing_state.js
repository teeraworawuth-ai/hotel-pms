const fs = require('fs');

let c = fs.readFileSync('src/app/components/RatePlanSettings.tsx', 'utf8');

c = c.replace(/const \[isPlanModalOpen, setIsPlanModalOpen\] = useState\(false\);/, 
  `const [ratePlanIcons, setRatePlanIcons] = useState<Record<string, string>>({});
  const [selectedIcon, setSelectedIcon] = useState<string>('⭐');
  const RATE_PLAN_EMOJIS = ['⭐', '🌟', '🔥', '💎', '🏖️', '❄️', '🚀', '🎁', '👑', '🌈', '⚡', '🎉', '🎃', '🎄', '💘'];
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);`);

c = c.replace(/setRatePlanIcons\(currentIcons\);\n\n      \/\/ Save Base Prices for each room type/g, 
  `setRatePlanIcons(currentIcons);\n      // Save Base Prices for each room type`);

// Also check the form emoji map typing
c = c.replace(/RATE_PLAN_EMOJIS.map\(emoji =>/g, `RATE_PLAN_EMOJIS.map((emoji: string) =>`);

fs.writeFileSync('src/app/components/RatePlanSettings.tsx', c, 'utf8');
console.log('Fixed state missing');
