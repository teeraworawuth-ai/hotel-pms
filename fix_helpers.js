const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');
const lines = content.split('\n');

const helpers = [
  "  const extraLineTotal = (ext: any) => {",
  "    if (ext.isSaved && ext.savedAmount !== undefined && !ext.isModified) return ext.savedAmount;",
  "    const q = ext.qty || 1;",
  "    return ext.isPerNight ? (ext.price * q * (Number(nights) || 1)) : (ext.price * q);",
  "  };",
  "",
  "  const handleChangeExtraQty = (id: string, delta: number) => {",
  "    setDailyExtras(prev => prev.map(e => {",
  "      if (e.id === id) {",
  "        const newQty = Math.max(1, (e.qty || 1) + delta);",
  "        return { ...e, qty: newQty, isModified: e.isSaved ? true : undefined };",
  "      }",
  "      return e;",
  "    }));",
  "  };",
  "",
  "  const handleVerifyExtrasPin = async () => {",
  "    if (!extrasPin) return;",
  "    setLoading(true);",
  "    setExtrasPinError('');",
  "    const { data: staffData, error } = await supabase.from('staff').select('role, name').eq('pin', extrasPin).single();",
  "    setLoading(false);",
  "    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {",
  "      setExtrasPinError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');",
  "      return;",
  "    }",
  "    setShowExtrasPinPrompt(false);",
  "    setExtrasPin('');",
  "    setExtrasManagerUnlocked(true);",
  "    setExtrasManagerName(staffData.name || staffData.role);",
  "  };",
  ""
];

const idx = lines.findIndex(l => l.includes('const handleAddExtra ='));
lines.splice(idx, 0, ...helpers);
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', lines.join('\n'), 'utf8');
console.log('Fixed');
