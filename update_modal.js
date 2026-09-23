const fs = require('fs');
let code = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// Add states
const stateInjection = `
  const [showVoidPinPrompt, setShowVoidPinPrompt] = useState(false);
  const [voidPin, setVoidPin] = useState('');
  const [showVoidPanel, setShowVoidPanel] = useState(false);
  const [voidRefundAmount, setVoidRefundAmount] = useState<number | ''>('');
  const [voidReason, setVoidReason] = useState('');
  const [voidRoomStatus, setVoidRoomStatus] = useState<'available' | 'dirty'>('available');
  const [voidError, setVoidError] = useState('');
`;
code = code.replace('const [isChangingRoom, setIsChangingRoom] = useState(false);', 'const [isChangingRoom, setIsChangingRoom] = useState(false);' + stateInjection);

// Add Logic
const logicInjection = `
  const handleVerifyVoidPin = async () => {
    if (!voidPin) return;
    setLoading(true);
    setVoidError('');
    const { data: staffData, error } = await supabase.from('staff').select('role').eq('pin', voidPin).single();
    setLoading(false);
    if (error || !staffData || (staffData.role !== 'admin' && staffData.role !== 'manager')) {
      setVoidError('รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager)');
      return;
    }
    // Success
    setShowVoidPinPrompt(false);
    setVoidPin('');
    setShowVoidPanel(true);
  };

  const handleExecuteVoid = async () => {
    if (!voidReason.trim()) {
      setVoidError('กรุณาระบุสาเหตุการยกเลิก');
      return;
    }
    setLoading(true);
    const refundAmt = Number(voidRefundAmount) || 0;
    
    // 1. Mark existing ledger transactions as voided
    const { data: txs } = await supabase.from('ledger_transactions').select('*').eq('booking_id', room.booking_id);
    
    if (txs) {
      let totalPayments = 0;
      for (const tx of txs) {
        if (!tx.category.includes('(Voided)')) {
          await supabase.from('ledger_transactions').update({ category: tx.category + ' (Voided)' }).eq('id', tx.id);
          if (tx.amount < 0) totalPayments += Math.abs(tx.amount);
        }
      }
      
      const penalty = totalPayments - refundAmt;
      if (penalty > 0 && activeShift) {
        // 2. Insert penalty charge & payment to balance the drawer
        await supabase.from('ledger_transactions').insert([
          {
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'revenue',
            category: 'รายได้ค่าปรับยกเลิกห้อง',
            amount: penalty
          },
          {
            shift_id: activeShift.id,
            staff_name: activeShift.staff_name,
            room_id: room.id,
            booking_id: room.booking_id,
            transaction_type: 'payment',
            category: 'รับชำระค่าปรับ (Penalty)',
            amount: -penalty
          }
        ]);
      }
    }

    // 3. Update Booking status
    await supabase.from('bookings').update({ 
      status: 'cancelled', 
      check_out_time: getNow().toISOString(), 
      remarks: 'Void Reason: ' + voidReason 
    }).eq('id', room.booking_id);
    
    // 4. Update Room status
    await supabase.from('rooms').update({ 
      status: voidRoomStatus,
      current_status: voidRoomStatus === 'available' ? 'ว่าง' : 'รอทำความสะอาด',
      stay_type: null,
      check_in_time: null,
      check_out_time: null,
      guest_count: 0,
      actual_price: null,
      staff_name: null,
      booking_id: null
    }).eq('id', room.id);
    
    setLoading(false);
    onUpdate();
    onClose();
  };
`;
code = code.replace('const handleCheckOut = async () => {', logicInjection + '\n\n  const handleCheckOut = async () => {');

// Add Button to Occupied section
const btnInjection = `
                  <button 
                    onClick={() => setShowVoidPinPrompt(true)} disabled={loading}
                    className="w-full py-4 text-slate-700 font-bold rounded-xl text-lg bg-slate-200 hover:bg-slate-300 shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                  >
                    ⚠️ ยกเลิกการเข้าพัก (Void)
                  </button>
`;
code = code.replace('onClick={handleCheckOut} disabled={loading}', btnInjection + '\n                  <button \n                    onClick={handleCheckOut} disabled={loading}');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', code, 'utf8');