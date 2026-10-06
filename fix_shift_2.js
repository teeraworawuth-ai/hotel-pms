const fs = require('fs');
let content = fs.readFileSync('src/contexts/ShiftContext.tsx', 'utf8');

const replacement = `  const refreshShift = async () => {
    setLoading(true);

    // Check AuthUser for Dummy Shift
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user.role === 'staff') {
          // Dummy shift for staff
          setActiveShift({
            id: 'dummy-shift-id',
            staff_id: user.id,
            staff_name: user.name,
            staff_role: 'staff',
            locations: user.locations || [],
            start_time: new Date().toISOString(),
            end_time: null,
            initial_cash: 0,
            expected_cash: 0,
            final_cash: null,
            discrepancy: null,
            status: 'open',
            signature_data: null
          });
          setLoading(false);
          return;
        }
      } catch (e) {}
    }

    // หา shift ที่กำลังเปิดอยู่ (ล่าสุด)`;

const lines = content.split(/\r?\n/);
const start = lines.findIndex(l => l.includes('const refreshShift = async () => {'));
if (start !== -1) {
  // Remove until '// หา shift'
  let end = start + 1;
  while (end < lines.length && !lines[end].includes('// หา shift')) {
    end++;
  }
  lines.splice(start, end - start + 1, replacement);
  fs.writeFileSync('src/contexts/ShiftContext.tsx', lines.join('\n'), 'utf8');
  console.log('Fixed ShiftContext!');
}
