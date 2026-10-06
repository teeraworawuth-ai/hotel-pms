const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
const lines = content.split(/\r?\n/);

const tuyaBtnIdx = lines.findIndex(l => l.includes("onClick={() => setActiveTab('tuya')}"));
if (tuyaBtnIdx !== -1) {
  // Find the closing </button>
  let endBtn = tuyaBtnIdx;
  while (endBtn < lines.length && !lines[endBtn].includes('</button>')) {
    endBtn++;
  }
  
  if (!content.includes("setActiveTab('staff')")) {
    const newBtn = [
      '            <button ',
      "              onClick={() => setActiveTab('staff')} ",
      "              className={`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}",
      '            >',
      '              จัดการผู้ใช้งาน (Staff)',
      '            </button>'
    ];
    lines.splice(endBtn + 1, 0, ...newBtn);
  }
}

const renderTuyaIdx = lines.findIndex(l => l.includes("{activeTab === 'tuya' && ("));
if (renderTuyaIdx !== -1 && !content.includes('<StaffSettings />')) {
  const newRender = [
    "        {activeTab === 'staff' && (",
    "          <StaffSettings />",
    "        )}"
  ];
  lines.splice(renderTuyaIdx, 0, ...newRender);
}

fs.writeFileSync('src/app/settings/page.tsx', lines.join('\n'), 'utf8');
console.log('Fixed tabs robustly');
