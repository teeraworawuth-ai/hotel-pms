const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const target = `  const handleAdditionalPayment = async () => {
    if (!activeShift) {
      alert('سԴС͹ӡêԹ');
      return;
    }
    if (!room.booking_id) return;
    
    setLoading(true);
    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    const paymentInserts = [];
    if (cash > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'cash', amount: -cash });
    if (transfer > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: paymentTime ? \`͹: \${paymentTime.replace('T', ' ')}\` : undefined });
    if (credit > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'credit_card', amount: -credit });
    
    if (paymentInserts.length > 0) {
      await supabase.from('ledger_transactions').insert(paymentInserts);
      
      const totalNewPayment = cash + transfer + credit;
      const { data: booking } = await supabase.from('bookings').select('unpaid_balance').eq('id', room.booking_id).single();
      if (booking) {
        const newBalance = (booking.unpaid_balance || 0) - totalNewPayment;
        await supabase.from('bookings').update({ unpaid_balance: newBalance }).eq('id', room.booking_id);
      }
    }
    
    setPayCash('');
    setPayTransfer('');
    setPayCredit('');
    setPaymentTime('');
    setLoading(false);
    onUpdate();
    alert('ѹ֡Թ');
  };`;

const replacement = `  const handleAdditionalPayment = async () => {
    if (!activeShift) {
      alert('กรุณาเปิดกะก่อนทำรายการ');
      return;
    }
    if (!room.booking_id) return;
    
    setLoading(true);
    const cash = Number(payCash) || 0;
    const transfer = Number(payTransfer) || 0;
    const credit = Number(payCredit) || 0;
    
    const paymentInserts = [];
    if (cash > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'cash', amount: -cash });
    if (transfer > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'transfer', amount: -transfer, notes: paymentTime ? \`โอนเวลา: \${paymentTime.replace('T', ' ')}\` : undefined });
    if (credit > 0) paymentInserts.push({ shift_id: activeShift.id, staff_name: activeShift.staff_name, room_id: room.id, booking_id: room.booking_id, transaction_type: 'payment', category: 'credit_card', amount: -credit });
    
    if (paymentInserts.length > 0) {
      await supabase.from('ledger_transactions').insert(paymentInserts);
      
      const totalNewPayment = cash + transfer + credit;
      const { data: booking } = await supabase.from('bookings').select('unpaid_balance').eq('id', room.booking_id).single();
      if (booking) {
        const newBalance = (booking.unpaid_balance || 0) - totalNewPayment;
        await supabase.from('bookings').update({ unpaid_balance: newBalance }).eq('id', room.booking_id);
      }
    }
    
    setPayCash('');
    setPayTransfer('');
    setPayCredit('');
    setPaymentTime('');
    setLoading(false);
    onUpdate();
    alert('บันทึกรับชำระเงินเพิ่มเติมสำเร็จ!');
  };`;

if(content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('Replaced');
} else {
  console.log('Not found');
}
fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
