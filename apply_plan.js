const fs = require('fs');

function applyPlan() {
  let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

  // 1. Add manager state for extras
  const stateInjection = `  const [extrasManagerUnlocked, setExtrasManagerUnlocked] = useState(false);
  const [extrasManagerName, setExtrasManagerName] = useState('');
  const [extrasEditNote, setExtrasEditNote] = useState('');
  const [showExtrasPinPrompt, setShowExtrasPinPrompt] = useState(false);
  const [extrasPin, setExtrasPin] = useState('');
  const [extrasPinError, setExtrasPinError] = useState('');
`;
  content = content.replace('const [voidPin, setVoidPin] = useState(\'\');\n', 'const [voidPin, setVoidPin] = useState(\'\');\n' + stateInjection);

  // 2. Extra item total helper & change qty handler
  const helpersInjection = `  const extraLineTotal = (ext: any) => {
    if (ext.isSaved && ext.savedAmount !== undefined && !ext.isModified) return ext.savedAmount;
    const q = ext.qty || 1;
    return ext.isPerNight ? (ext.price * q * (Number(nights) || 1)) : (ext.price * q);
  };

  const handleChangeExtraQty = (id: string, delta: number) => {
    setDailyExtras(prev => prev.map(e => {
      if (e.id === id) {
        const newQty = Math.max(1, (e.qty || 1) + delta);
        return { ...e, qty: newQty, isModified: e.isSaved ? true : undefined };
      }
      return e;
    }));
  };

  const handleVerifyExtrasPin = async () => {
    if (!extrasPin) return;
    setLoading(true);
    setExtrasPinError('');
    const { data: staffData, error } = await supabase.from('staff').select('role, name').eq('pin', extrasPin).single();
    setLoading(false);
    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setExtrasPinError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }
    setShowExtrasPinPrompt(false);
    setExtrasPin('');
    setExtrasManagerUnlocked(true);
    setExtrasManagerName(staffData.name || staffData.role);
  };
`;
  content = content.replace('  const handleAddExtra = (setting: any) => {\n', helpersInjection + '  const handleAddExtra = (setting: any) => {\n');

  // 3. handleAddExtra replacement
  const handleAddExtraOld = `  const handleAddExtra = (setting: any) => {
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
  };`;
  
  const handleAddExtraNew = `  const handleAddExtra = (setting: any) => {
    const isPerNight = setting.charge_type === 'per_night';
    const existingIndex = dailyExtras.findIndex(e => e.settingId === setting.id && !e.isSaved);
    
    if (existingIndex >= 0) {
      const newExtras = [...dailyExtras];
      newExtras[existingIndex].qty += 1;
      setDailyExtras(newExtras);
    } else {
      setDailyExtras([...dailyExtras, {
        id: Date.now().toString(),
        settingId: setting.id,
        name: setting.name,
        price: setting.price,
        qty: 1,
        isPerNight,
      }]);
    }
  };`;
  content = content.replace(handleAddExtraOld, handleAddExtraNew);

  // 4. getTotalExtrasAmount replacement
  const getTotalOld = `  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => {
    return sum + (ext.isPerNight ? (ext.price * ext.qty * (Number(nights) || 1)) : (ext.price * ext.qty));
  }, 0);`;
  const getTotalNew = `  const getTotalExtrasAmount = () => dailyExtras.reduce((sum, ext) => sum + extraLineTotal(ext), 0);`;
  content = content.replace(getTotalOld, getTotalNew);

  // 5. handleCheckIn: use extraLineTotal & remove erroneous block
  content = content.replace(/amount: ext.isPerNight \? \(ext.price \* ext.qty \* \(Number\(nights\) \|\| 1\)\) : \(ext.price \* ext.qty\)/g, 'amount: extraLineTotal(ext)');
  
  // Find and remove the [NEW] Sync Key Deposit and Sync Extra Charges block (L647-671 approx)
  const syncBlockStart = '    // [NEW] Sync Key Deposit Charge for existing bookings';
  const syncBlockEnd = '    const paymentInserts = [];';
  const startIdx = content.indexOf(syncBlockStart);
  const endIdx = content.indexOf(syncBlockEnd, startIdx);
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + content.substring(endIdx);
  }

  // 6. handleAdditionalPayment updates
  const addPayStart = content.indexOf('  const handleAdditionalPayment = async () => {');
  if (addPayStart !== -1) {
    // Inject Key Deposit sync right before paymentInserts
    const payInsStart = content.indexOf('    const paymentInserts = [];', addPayStart);
    if (payInsStart !== -1) {
      const keyDepSync = `
    // Sync Key Deposit Charge for existing bookings
    if (keyDepositEnabled !== initialKeyDepositStatus) {
      if (keyDepositEnabled && Number(keyDepositAmount) > 0) {
        await supabase.from('ledger_transactions').insert({
          shift_id: activeShift.id, staff_name: activeShift.staff_name,
          room_id: room.id, booking_id: room.booking_id,
          transaction_type: 'revenue', category: 'ค่ามัดจำกุญแจ', amount: Number(keyDepositAmount)
        });
      } else if (!keyDepositEnabled) {
        await supabase.from('ledger_transactions').delete().eq('booking_id', room.booking_id).in('category', ['ค่ามัดจำกุญแจ', 'key_deposit']).gt('amount', 0);
      }
      setInitialKeyDepositStatus(keyDepositEnabled);
    }
`;
      content = content.substring(0, payInsStart) + keyDepSync + content.substring(payInsStart);
    }

    // Now fix extras inserting - manager modifications and new extras
    // Find where I inserted `let newExtrasTotal = 0;` earlier and replace it
    const newExtrasBlockStart = content.indexOf('    let newExtrasTotal = 0;', addPayStart);
    const newExtrasBlockEnd = content.indexOf('    if (cash > 0) paymentInserts.push({ shift_id: activeShift.id', addPayStart);
    
    if (newExtrasBlockStart !== -1 && newExtrasBlockEnd !== -1) {
      const advancedExtrasBlock = `    let newExtrasTotal = 0;
    
    // Process new extras
    const newExtras = dailyExtras.filter(e => !e.isSaved);
    if (newExtras.length > 0) {
      newExtras.forEach(ext => {
        paymentInserts.push({
          shift_id: activeShift.id,
          staff_name: activeShift.staff_name,
          room_id: room.id,
          booking_id: room.booking_id,
          transaction_type: 'revenue',
          category: ext.name,
          notes: ext.isPerNight ? '(' + (nights || 1) + ' คืน)' : null,
          amount: extraLineTotal(ext)
        });
        newExtrasTotal += extraLineTotal(ext);
      });
    }

    // Process manager modified saved extras
    if (extrasManagerUnlocked && extrasEditNote.trim()) {
      const modifiedExtras = dailyExtras.filter(e => e.isSaved && e.isModified);
      for (const ext of modifiedExtras) {
        const oldAmount = ext.savedAmount || 0;
        const newAmount = extraLineTotal(ext);
        if (oldAmount !== newAmount) {
          // 1. Void old ledger entry
          await supabase.from('ledger_transactions').update({ category: ext.name + ' (Voided)' }).eq('id', ext.id);
          // 2. Insert new entry
          paymentInserts.push({
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'revenue',
            category: ext.name,
            notes: (ext.isPerNight ? '(' + (nights || 1) + ' คืน) ' : '') + 'แก้โดย ' + extrasManagerName + ': ' + extrasEditNote,
            amount: newAmount
          });
          newExtrasTotal += (newAmount - oldAmount);
        }
      }
    }
`;
      content = content.substring(0, newExtrasBlockStart) + advancedExtrasBlock + content.substring(newExtrasBlockEnd);
    }

    // And make sure it doesn't clear dailyExtras
    content = content.replace('setDailyExtras([]); // clear extras after save\n', '');
  }

  // 7. useEffect ledger history
  const historyOld = `            // Load existing extra charges
            const existingExtras = data.filter(d => 
              d.transaction_type === 'revenue' && 
              !['ค่าห้องพัก', 'ค่ามัดจำกุญแจ', 'key_deposit', 'early_in_fee', 'late_out_fee'].includes(d.category) &&
              !d.category.includes('ค่าห้องพัก')
            ).map(d => ({
              id: d.id,
              name: d.category,
              price: d.amount,
              qty: 1,
              isPerNight: d.notes?.includes('คืน'),
              amount: d.amount,
              isSaved: true
            }));
            if (existingExtras.length > 0) {
              setDailyExtras(existingExtras);
            }`;
  const historyNew = `            // Load existing extra charges using whitelist
            const allowedExtraNames = extraSettings.map(s => s.name);
            const existingExtras = data.filter(d => 
              d.transaction_type === 'revenue' && 
              !d.category.includes('(Voided)') &&
              (allowedExtraNames.includes(d.category) || (!['ค่าห้องพัก', 'ค่ามัดจำกุญแจ', 'key_deposit', 'early_in_fee', 'late_out_fee'].includes(d.category) && !d.category.includes('ค่าห้องพัก')))
            ).map(d => ({
              id: d.id,
              name: d.category,
              price: d.amount, // Approximate unit price
              qty: 1, // We don't parse qty from notes easily, so treat it as 1 bundle
              isPerNight: !!d.notes?.includes('คืน'),
              savedAmount: d.amount,
              isSaved: true
            }));
            if (existingExtras.length > 0) {
              setDailyExtras(existingExtras);
            }`;
  content = content.replace(historyOld, historyNew);

  fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
  console.log('Phase 1 applied');
}

applyPlan();
