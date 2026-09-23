const fs = require('fs');
let code = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const tabButtons = `        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          <button 
            onClick={() => setActiveTab('rooms')} 
            className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'rooms' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
          >
            ตั้งค่าห้องพัก
          </button>
          <button 
            onClick={() => setActiveTab('rate-plans')} 
            className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'rate-plans' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
          >
            แผนราคา (Rate Plans)
          </button>
          <button 
            onClick={() => setActiveTab('pos')} 
            className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'pos' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
          >
            จัดการปุ่ม POS
          </button>
          <button 
            onClick={() => setActiveTab('tuya')} 
            className={\`whitespace-nowrap px-6 py-2.5 rounded-lg font-bold text-sm transition-all \${activeTab === 'tuya' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}\`}
          >
            ตั้งค่าคีย์ Tuya
          </button>
        </div>`;

code = code.replace(/<div className="flex gap-2 bg-slate-100 p-1 rounded-xl">[\s\S]*?<\/div>/, tabButtons);

const tabContent = `      {activeTab === 'pos' ? (
        <PosSettings />
      ) : activeTab === 'tuya' ? (
        <TuyaApiSettings />
      ) : activeTab === 'rate-plans' ? (
        <RatePlanSettings />
      ) : (`;

code = code.replace(/\{activeTab === 'pos' \? \([\s\S]*?\) : activeTab === 'tuya' \? \([\s\S]*?\) : \(/, tabContent);

fs.writeFileSync('src/app/settings/page.tsx', code);
console.log('Fixed tabs');
