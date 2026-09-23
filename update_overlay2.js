const fs = require('fs');
let code = fs.readFileSync('src/app/components/TimeSimulatorOverlay.tsx', 'utf8');

// Need to import supabase if not already
if (!code.includes('import { supabase }')) {
  code = code.replace('import { useSimulatedTime }', 'import { supabase } from "@/lib/supabase";\nimport { useSimulatedTime }');
}

const resetInjection = `
  const handleReset = async () => {
    setSimulatedTime(null);
    
    // Auto-Eraser: Delete any dummy charges created by the simulator
    try {
      const { data, error } = await supabase
        .from('ledger_transactions')
        .delete()
        .eq('staff_name', 'SYSTEM (Simulated)')
        .select();
        
      if (data && data.length > 0) {
        console.log('Erased simulated transactions:', data);
        alert(\`ยางลบอัตโนมัติทำงาน: ลบบิลค่าห้องที่เกิดจากการจำลองทิ้งไป \${data.length} รายการ เพื่อคืนค่าระบบ!\`);
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to erase simulated data', err);
    }
  };
`;

code = code.replace(
  /const handleReset = \(\) => {[\s\S]*?};/,
  resetInjection.trim()
);

fs.writeFileSync('src/app/components/TimeSimulatorOverlay.tsx', code, 'utf8');