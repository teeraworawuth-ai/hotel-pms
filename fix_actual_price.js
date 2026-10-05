const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');
const apLine = lines.findIndex(l => l.includes('value={day.actualPrice}'));

const replacement = `                                      <input 
                                        type="number" min="0" 
                                        value={day.actualPrice} 
                                        onChange={(e) => updateDailyActualPrice(day.date, e.target.value)}
                                        disabled={room.status === 'occupied' || room.status === 'reserved'}
                                        className={\`w-full border rounded-lg pl-7 pr-2 py-1.5 font-bold \${colorClass} \${bgClass} transition-colors\`}
`;

lines.splice(apLine - 2, 5, ...replacement.split('\n'));
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Disabled actualPrice for reserved/occupied');
