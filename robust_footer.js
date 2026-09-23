const fs = require('fs');
const { execSync } = require('child_process');

// 1. Get the pristine old button content
const oldCode = execSync('git show e46cc57:src/app/checkin/page.tsx').toString('utf8');
const mapStart = oldCode.indexOf('locRooms.map(room => {');
const buttonStart = oldCode.indexOf('<button', mapStart);
const buttonEnd = oldCode.indexOf('</button>', buttonStart) + 9;
let pristineButton = oldCode.substring(buttonStart, buttonEnd);

// 2. Modify the pristine button's top-level structure
// Change the <button> class to be a flex-col container
pristineButton = pristineButton.replace('relative aspect-[4/3] flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}', 
  'relative flex flex-col items-center justify-start rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass} min-h-[140px]');

// 3. Wrap all inner content (Left, Center, Right sections) in a relative flex-1 container
// Find the first child after <button ... >
const buttonTagEnd = pristineButton.indexOf('>') + 1;
const innerContent = pristineButton.substring(buttonTagEnd, pristineButton.lastIndexOf('</button>'));

// 4. Create the new 1-line footer
const footerHtml = `
                        {/* Financial Summary for Occupied Rooms */}
                        {room.status === 'occupied' && (
                          <div className="w-full h-[22px] flex-shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-[13px] font-black z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-600">
                            <span>{room.total_charges || 0}</span>
                            <span className="text-slate-400 font-bold">-</span>
                            <span>{room.total_payments || 0}</span>
                            <span className="text-slate-400 font-bold">=</span>
                            <span className={((room.unpaid_balance || 0) < 0) ? 'text-indigo-600' : (room.unpaid_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {room.unpaid_balance || 0}
                            </span>
                          </div>
                        )}`;

// 5. Reassemble the button
const wrappedButton = pristineButton.substring(0, buttonTagEnd) + 
  '\n                        <div className="relative flex-1 w-full h-full min-h-[110px]">' + 
  innerContent + 
  '\n                        </div>' + 
  footerHtml + 
  '\n                      </button>';

// 6. Replace it in the current file
const currentCode = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');
const curMapStart = currentCode.indexOf('locRooms.map(room => {');
const curButtonStart = currentCode.indexOf('<button', curMapStart);
const curButtonEnd = currentCode.indexOf('</button>', curButtonStart) + 9;

const newPageCode = currentCode.substring(0, curButtonStart) + wrappedButton + currentCode.substring(curButtonEnd);

fs.writeFileSync('src/app/checkin/page.tsx', newPageCode, 'utf8');
console.log('Successfully applied robust flex layout for footer.');