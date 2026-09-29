const fs = require('fs');
let content = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

content = content.replace('import RatePlanSettings from "@/app/components/RatePlanSettings";', 'import RatePlanSettings from "@/app/components/RatePlanSettings";\nimport ExtraChargesSettings from "@/app/components/ExtraChargesSettings";');

content = content.replace("useState<'rooms' | 'pos' | 'tuya' | 'rate-plans'>", "useState<'rooms' | 'pos' | 'tuya' | 'rate-plans' | 'extras'>");

const tabNav = `<button onClick={() => setActiveTab('rate-plans')} className={\`py-4 px-2 border-b-2 font-medium text-sm \${activeTab === 'rate-plans' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}\`}>`;

const newTabNav = `<button onClick={() => setActiveTab('extras')} className={\`py-4 px-2 border-b-2 font-bold text-sm \${activeTab === 'extras' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}\`}>
                ค่าใช้จ่ายเพิ่มเติม (Extras)
              </button>\n              ` + tabNav;

content = content.replace(tabNav, newTabNav);

const tabContent = `{activeTab === 'rate-plans' && <RatePlanSettings />}`;
const newTabContent = tabContent + `\n        {activeTab === 'extras' && <ExtraChargesSettings />}`;

content = content.replace(tabContent, newTabContent);

fs.writeFileSync('src/app/settings/page.tsx', content, 'utf8');
