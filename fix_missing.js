const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const injection = "  const [extrasManagerUnlocked, setExtrasManagerUnlocked] = useState(false);\n" +
"  const [extrasManagerName, setExtrasManagerName] = useState('');\n" +
"  const [extrasEditNote, setExtrasEditNote] = useState('');\n" +
"  const [showExtrasPinPrompt, setShowExtrasPinPrompt] = useState(false);\n" +
"  const [extrasPin, setExtrasPin] = useState('');\n" +
"  const [extrasPinError, setExtrasPinError] = useState('');\n";

const target = "  const [voidPin, setVoidPin] = useState('');";
if (content.includes(target) && !content.includes('extrasManagerUnlocked')) {
  content = content.replace(target, target + "\n" + injection);
}

const helpersInjection = "  const extraLineTotal = (ext: any) => {\n" +
"    if (ext.isSaved && ext.savedAmount !== undefined && !ext.isModified) return ext.savedAmount;\n" +
"    const q = ext.qty || 1;\n" +
"    return ext.isPerNight ? (ext.price * q * (Number(nights) || 1)) : (ext.price * q);\n" +
"  };\n\n" +
"  const handleChangeExtraQty = (id: string, delta: number) => {\n" +
"    setDailyExtras(prev => prev.map(e => {\n" +
"      if (e.id === id) {\n" +
"        const newQty = Math.max(1, (e.qty || 1) + delta);\n" +
"        return { ...e, qty: newQty, isModified: e.isSaved ? true : undefined };\n" +
"      }\n" +
"      return e;\n" +
"    }));\n" +
"  };\n\n" +
"  const handleVerifyExtrasPin = async () => {\n" +
"    if (!extrasPin) return;\n" +
"    setLoading(true);\n" +
"    setExtrasPinError('');\n" +
"    const { data: staffData, error } = await supabase.from('staff').select('role, name').eq('pin', extrasPin).single();\n" +
"    setLoading(false);\n" +
"    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {\n" +
"      setExtrasPinError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');\n" +
"      return;\n" +
"    }\n" +
"    setShowExtrasPinPrompt(false);\n" +
"    setExtrasPin('');\n" +
"    setExtrasManagerUnlocked(true);\n" +
"    setExtrasManagerName(staffData.name || staffData.role);\n" +
"  };\n";


const target2 = "  const handleAddExtra = (setting: any) => {";
if (content.includes(target2) && !content.includes('extraLineTotal =')) {
  content = content.replace(target2, helpersInjection + "\n" + target2);
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
console.log('Fixed');
