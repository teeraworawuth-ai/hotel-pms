const fs = require('fs');
let content = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const keyDepositIcon = `
                        {/* Key Deposit Indicator */}
                        {room.has_key_deposit && (
                          <div className={\`absolute left-1 \${room.status === 'occupied' ? 'bottom-[16px] sm:bottom-[20px]' : 'bottom-1'} text-[12px] sm:text-[14px] drop-shadow-sm z-20\`} title="รับมัดจำกุญแจแล้ว">
                            🔑<span className="absolute -bottom-1 -right-1 text-[8px] sm:text-[10px]">✅</span>
                          </div>
                        )}
                        
                        {/* Financial Summary for Occupied Rooms */}`;

content = content.replace(/\{(\/\*\s*)Financial Summary for Occupied Rooms(\s*\*\/)\}/, keyDepositIcon);

fs.writeFileSync('src/app/checkin/page.tsx', content, 'utf8');
