const fs = require('fs');
let code = fs.readFileSync('src/app/components/BillingModal.tsx', 'utf8');

// Insert Print Button in Full Tab
const printButton = `
                      {billTab === 'full' && (
                        <div className="pt-2 mt-2 border-t border-slate-100">
                          <button 
                            onClick={() => window.print()}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                          >
                            <span>🖨️</span> พิมพ์ใบเสร็จรวมทั้งหมด (Print Full Receipt)
                          </button>
                        </div>
                      )}
                    </>
`;

code = code.replace(
  /<\/>/,
  printButton.trim()
);

fs.writeFileSync('src/app/components/BillingModal.tsx', code, 'utf8');