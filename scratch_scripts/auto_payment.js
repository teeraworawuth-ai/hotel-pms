const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

// 1. Add newBookingId state
content = content.replace(
  'const [showBilling, setShowBilling] = useState(false);',
  'const [showBilling, setShowBilling] = useState(false);\n  const [newBookingId, setNewBookingId] = useState<string | null>(null);'
);

// 2. Modify handleCheckIn
const oldHandleCheckInEnd = `    // 2. ถ้าเป็นการ Check-in จริงๆ ใน "วันนี้" (ไม่ใช่แค่จอง) ให้บันทึกลงตาราง Rooms ด้วย
    if (dateOffset === 0 && !isReservationForToday && !bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: type,
          check_in_time: startDate.toISOString(),
          check_out_time: checkoutDate.toISOString(),
          guest_count: Number(guestCount) || 1,
          current_status: \`มีแขก (\${type === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว'})\`,
          actual_price: actualPrice === '' ? null : Number(actualPrice),
          staff_name: staffName || null
        })
        .eq('id', room.id);
    }

    setLoading(false);
    onUpdate();
  };`;

const newHandleCheckInEnd = `    // 2. ถ้าเป็นการ Check-in จริงๆ ใน "วันนี้" (ไม่ใช่แค่จอง) ให้บันทึกลงตาราง Rooms ด้วย
    if (dateOffset === 0 && !isReservationForToday && !bookingError) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          stay_type: type,
          check_in_time: startDate.toISOString(),
          check_out_time: checkoutDate.toISOString(),
          guest_count: Number(guestCount) || 1,
          current_status: \`มีแขก (\${type === 'overnight' ? 'ค้างคืน' : 'ชั่วคราว'})\`,
          actual_price: actualPrice === '' ? null : Number(actualPrice),
          staff_name: staffName || null
        })
        .eq('id', room.id);
    }

    setLoading(false);
    if (!bookingError && insertedBooking) {
      setNewBookingId(insertedBooking.id);
      setShowBilling(true);
    } else {
      onUpdate();
    }
  };`;

content = content.replace(oldHandleCheckInEnd, newHandleCheckInEnd);

// 3. Modify handleCheckInReserved
const oldHandleCheckInReservedEnd = `        .update({
          status: 'occupied',
          stay_type: 'overnight',
          check_in_time: getNow().toISOString(), // actual check-in time instead of booked time
          check_out_time: room.check_out_time, // original checkout time
          guest_count: room.guest_count,
          current_status: \`มีแขก (ค้างคืน)\`,
          actual_price: room.actual_price,
          staff_name: room.staff_name || null
        })
        .eq('id', room.id);
    }
    
    setLoading(false);
    onUpdate();
  };`;

const newHandleCheckInReservedEnd = `        .update({
          status: 'occupied',
          stay_type: 'overnight',
          check_in_time: getNow().toISOString(), // actual check-in time instead of booked time
          check_out_time: room.check_out_time, // original checkout time
          guest_count: room.guest_count,
          current_status: \`มีแขก (ค้างคืน)\`,
          actual_price: room.actual_price,
          staff_name: room.staff_name || null
        })
        .eq('id', room.id);
    }
    
    setLoading(false);
    setShowBilling(true);
  };`;

content = content.replace(oldHandleCheckInReservedEnd, newHandleCheckInReservedEnd);

// 4. Update BillingModal render
const oldBillingRender = `{showBilling && room.booking_id && (
        <BillingModal 
          roomId={room.id}
          roomNo={room.room_no}
          bookingId={room.booking_id}
          onClose={() => { setShowBilling(false); onUpdate(); }}
          onSuccess={() => { setShowBilling(false); onUpdate(); }}
        />
      )}`;

const newBillingRender = `{showBilling && (newBookingId || room.booking_id) && (
        <BillingModal 
          roomId={room.id}
          roomNo={room.room_no}
          bookingId={(newBookingId || room.booking_id) as string}
          onClose={() => { setShowBilling(false); onUpdate(); }}
          onSuccess={() => { setShowBilling(false); onUpdate(); }}
        />
      )}`;

content = content.replace(oldBillingRender, newBillingRender);

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
