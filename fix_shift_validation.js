const fs = require('fs');
let content = fs.readFileSync('src/app/components/ShiftManager.tsx', 'utf8');

const validationLogic = `const handleOpenShift = async () => {
    setErrorMsg("");
    if (initialCash === '') {
      setErrorMsg("กรุณาระบุเงินทอนเริ่มต้นในลิ้นชัก (ใส่ 0 ก็ได้)");
      return;
    }`;

content = content.replace(
  'const handleOpenShift = async () => {\n    setErrorMsg("");',
  validationLogic
);

fs.writeFileSync('src/app/components/ShiftManager.tsx', content);
console.log("Updated handleOpenShift validation");
