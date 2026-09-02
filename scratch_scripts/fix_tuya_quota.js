const fs = require('fs');
let content = fs.readFileSync('src/app/components/TuyaQuotaWidget.tsx', 'utf8');

const packageMathRegex = /const packageTotalDays = \([\s\S]*?const packagePercent = Math\.min\(100, \(packageDaysUsed \/ packageTotalDays\) \* 100\);/;

const newPackageMath = `const trialDays = 30;
    const extensionDays = 180;
    const totalDays = trialDays + extensionDays;
    const packageDaysUsed = Math.floor((now.getTime() - keyStartDate.getTime()) / (1000 * 3600 * 24));
    
    let currentPhase = "";
    let phaseDaysUsed = 0;
    let phaseTotalDays = 0;
    
    if (packageDaysUsed <= trialDays) {
       currentPhase = "ช่วงทดลองใช้ฟรี (1 เดือนแรก)";
       phaseDaysUsed = packageDaysUsed;
       phaseTotalDays = trialDays;
    } else if (packageDaysUsed <= totalDays) {
       currentPhase = "ช่วงขยายเวลา (6 เดือน)";
       phaseDaysUsed = packageDaysUsed - trialDays;
       phaseTotalDays = extensionDays;
    } else {
       currentPhase = "หมดอายุ (ครบ 7 เดือน)";
       phaseDaysUsed = extensionDays;
       phaseTotalDays = extensionDays;
    }
    
    const phaseDaysLeft = Math.max(0, phaseTotalDays - phaseDaysUsed);
    const phasePercent = Math.min(100, (phaseDaysUsed / phaseTotalDays) * 100);
    const totalDaysLeft = Math.max(0, totalDays - packageDaysUsed);`;

content = content.replace(packageMathRegex, newPackageMath);

const jsxRegex = /\{\/\* Package Lifetime \*\/\}[\s\S]*?\{\/\* Monthly Quota \*\/\}/;

const newJsx = `{/* Package Lifetime */}
           <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-between">
              <div>
                  <div className="flex items-center gap-2 mb-3">
                     <span className="text-xl">📅</span>
                     <h4 className="font-bold text-slate-700">อายุอีเมล (คีย์ Tuya)</h4>
                  </div>
                  
                  <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between mb-4 mt-2">
                     <span>สถานะปัจจุบัน:</span>
                     <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-xs">{currentPhase}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm mb-1 mt-2 font-medium">
                     <span className="text-slate-500">ใช้มาแล้ว (รอบนี้): {phaseDaysUsed} วัน</span>
                     <span className="text-indigo-600 font-bold">เหลืออีก: {phaseDaysLeft} วัน</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                     <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: \`\${phasePercent}%\` }}></div>
                  </div>
              </div>
              <p className="text-xs text-slate-400 mt-4 flex justify-between border-t border-slate-200 pt-3">
                 <span>รวมเหลือทั้งหมด: <strong className="text-slate-500">{totalDaysLeft} วัน</strong></span>
                 <span>เริ่ม: {keyStartDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit'})}</span>
              </p>
           </div>

           {/* Monthly Quota */}`;

content = content.replace(jsxRegex, newJsx);

fs.writeFileSync('src/app/components/TuyaQuotaWidget.tsx', content);
console.log('Fixed TuyaQuotaWidget');
