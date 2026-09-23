const fs = require('fs');
let code = fs.readFileSync('src/app/components/TimeSimulatorOverlay.tsx', 'utf8');

const injection = `
  const handleSimulate = async () => {
    if (!dateInput || !timeInput) return;
    const newDate = new Date(\`\${dateInput}T\${timeInput}\`);
    setSimulatedTime(newDate);
    
    // Auto-trigger Night Audit if time >= 09:45
    const hours = newDate.getHours();
    const minutes = newDate.getMinutes();
    if (hours > 9 || (hours === 9 && minutes >= 45)) {
      try {
        const res = await fetch(\`/api/cron/night-audit?simulated_date=\${newDate.toISOString()}\`, { method: 'POST' });
        const data = await res.json();
        console.log('Simulated Night Audit triggered:', data);
        if (data.posted > 0) {
          alert(\`บอททำงานอัตโนมัติ: ดึงค่าห้องพักเข้ามา \${data.posted} รายการ\`);
          window.location.reload(); // Refresh to show new charges
        }
      } catch (err) {
        console.error('Failed to trigger simulated night audit', err);
      }
    }
  };
`;

code = code.replace(
  /const handleSimulate = \(\) => {[\s\S]*?};/,
  injection.trim()
);

fs.writeFileSync('src/app/components/TimeSimulatorOverlay.tsx', code, 'utf8');