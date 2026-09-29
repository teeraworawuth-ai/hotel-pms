const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

content = content.replace(/setNewBookingId\(insertedBooking\.id\);\s*setShowBilling\(true\);/g, 'onSuccess();');

content = content.replace(/setLoading\(false\);\s*setShowBilling\(true\);\s*};\s*const handleVerifyVoidPin/g, 'setLoading(false);\n    onSuccess();\n  };\n\n  const handleVerifyVoidPin');

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');
