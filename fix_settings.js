const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

if (!content.includes("'staff'")) {
  content = content.replace("| 'rate-plans' | 'extras'>('rate-plans');", "| 'rate-plans' | 'extras' | 'staff'>('rate-plans');");
  
  const navTabs = `
          <button
            onClick={() => setActiveTab('extras')}
            className={\`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors \${
              activeTab === 'extras'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }\`}
          >
            รายการค่าใช้จ่ายเพิ่มเติม
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={\`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors \${
              activeTab === 'staff'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }\`}
          >
            จัดการผู้ใช้งาน (Staff)
          </button>
  `;
  
  content = content.replace(/<button[\s\S]*?onClick=\{\(\) => setActiveTab\('extras'\)\}[\s\S]*?<\/button>/, navTabs);
  
  const importStaff = "import StaffSettings from '@/app/components/StaffSettings';\n";
  content = importStaff + content;
  
  const renderStaff = `
          {activeTab === 'extras' && (
            <ExtraChargesSettings />
          )}
          {activeTab === 'staff' && (
            <StaffSettings />
          )}`;
  content = content.replace(/\{activeTab === 'extras' && \([\s\S]*?\)\}/, renderStaff);
  
  fs.writeFileSync('src/app/settings/page.tsx', content, 'utf8');
  console.log('Updated Settings page tabs');
}
