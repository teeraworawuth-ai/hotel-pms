const fs = require('fs');
let content = fs.readFileSync('src/contexts/ShiftContext.tsx', 'utf8');

// I also need to make sure staff_role exists in Shift interface
if (!content.includes('staff_role?: string;')) {
  content = content.replace('staff_name: string;', 'staff_name: string;\n  staff_role?: string;');
}

// And locations for tester
if (!content.includes('locations?: string[];')) {
  content = content.replace('staff_role?: string;', 'staff_role?: string;\n  locations?: string[];');
}

const replacement = `
  const refreshShift = async () => {
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

    // หา shift ที่กำลังเปิดอยู่ (ล่าสุด)
`;

content = content.replace('  const refreshShift = async () => {\n    setLoading(true);\n    // หา shift ที่กำลังเปิดอยู่ (ล่าสุด)', replacement);

// And fetch staff_role for real shifts
const fetchRole = `
      const shiftData = data as Shift;

      // ดึง Role ของพนักงาน
      const { data: staffData } = await supabase
        .from('staff')
        .select('role')
        .eq('id', shiftData.staff_id)
        .single();
      
      if (staffData) {
        shiftData.staff_role = staffData.role;
      }
`;
if (!content.includes('const { data: staffData } = await supabase')) {
  content = content.replace('const shiftData = data as Shift;', fetchRole);
}

fs.writeFileSync('src/contexts/ShiftContext.tsx', content, 'utf8');
console.log('Updated ShiftContext');
