const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const extraSettingsCode = `  const [extraSettings, setExtraSettings] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('extra_charge_settings').select('*').eq('is_active', true).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setExtraSettings(data); });
  }, []);`;

content = content.replace("const [dailyExtras, setDailyExtras] = useState<any[]>([]);", extraSettingsCode + "\n  const [dailyExtras, setDailyExtras] = useState<any[]>([]);");

// Add logic to handle adding extra
const addExtraLogic = `  const handleAddExtra = (setting: any) => {
    const qty = 1;
    const n = Number(nights) || 1;
    const isPerNight = setting.charge_type === 'per_night';
    const total = isPerNight ? setting.price * qty * n : setting.price * qty;
    
    setDailyExtras([...dailyExtras, {
      id: Date.now().toString(),
      name: setting.name,
      price: setting.price,
      qty,
      isPerNight,
      amount: total
    }]);
  };
  
  const handleRemoveExtra = (id: string) => {
    setDailyExtras(dailyExtras.filter(e => e.id !== id));
  };`;

content = content.replace("const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + Number(ext.amount || 0), 0);", addExtraLogic + "\n\n  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + Number(ext.amount || 0), 0);");

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
