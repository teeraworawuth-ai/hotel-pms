const fs = require('fs');
let code = fs.readFileSync('src/app/checkin/page.tsx', 'utf8');

const targetLogic = `                              let roomNoColor = 'text-slate-700';
                              if (room.status === 'occupied' || room.status === 'reserved') {
                                const unpaid = room.unpaid_balance || 0;
                                const total = room.actual_price || 0;
                                if (unpaid > 0) {
                                  if (total > 0 && unpaid < total) {
                                    roomNoColor = 'text-orange-500';
                                  } else {
                                    roomNoColor = 'text-rose-600';
                                  }
                                } else {
                                  roomNoColor = 'text-emerald-500';
                                }
                              }`;

const newLogic = `                              let roomNoColor = 'text-slate-700';
                              if (room.status === 'occupied' || room.status === 'reserved') {
                                const unpaid = room.unpaid_balance || 0;
                                const payments = room.total_payments || 0;
                                if (unpaid > 0) {
                                  if (payments > 0) {
                                    roomNoColor = 'text-orange-500';
                                  } else {
                                    roomNoColor = 'text-rose-600';
                                  }
                                } else {
                                  roomNoColor = 'text-emerald-500';
                                }
                              }`;

code = code.replace(targetLogic, newLogic);
fs.writeFileSync('src/app/checkin/page.tsx', code, 'utf8');