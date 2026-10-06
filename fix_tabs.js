const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const targetStr = `            <button 
              onClick={() => setActiveTab('tuya')} 
              className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'tuya' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
            >
              ตั้งค่าคีย์ Tuya
            </button>
          </div>`;

const newTabs = `            <button 
              onClick={() => setActiveTab('tuya')} 
              className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'tuya' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
            >
              ตั้งค่าคีย์ Tuya
            </button>
            <button 
              onClick={() => setActiveTab('staff')} 
              className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
            >
              จัดการผู้ใช้งาน (Staff)
            </button>
          </div>`;

if (content.includes('ตั้งค่าคีย์ Tuya')) {
  // Replace using string match to be safer
  content = content.replace(targetStr, newTabs);
}

// Ensure the staff component renders
const renderTarget = `{activeTab === 'tuya' && (
          <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-100">`;

const renderTarget2 = `
        {activeTab === 'staff' && (
          <StaffSettings />
        )}
`;

if (!content.includes('<StaffSettings />')) {
  // inject before the closing tag of the main container, or right after the tuya block
  // Let's just find the last closing div of tuya, or simply inject before `</main>` or similar.
  // wait, the file has multiple `{activeTab === ...` blocks.
  content = content.replace(renderTarget, renderTarget2 + '\n        ' + renderTarget);
}

fs.writeFileSync('src/app/settings/page.tsx', content, 'utf8');
console.log('Fixed tabs');
