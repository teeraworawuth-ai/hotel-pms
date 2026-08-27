const fs = require('fs');
let content = fs.readFileSync('src/app/audit/AnomalyReport.tsx', 'utf8');

const fetchRegex = /const fetchData = async \(\) => \{[\s\S]*?setLoading\(false\);\s*\};/m;

const newBlock = `const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(\`/api/audit/anomalies?dateOffset=\${dateOffset}\`);
      if (!res.ok) {
        console.error("Failed to fetch anomalies");
        return;
      }
      const json = await res.json();
      
      const parsedAnomalies = (json.anomalies || []).map((anomaly: any) => ({
        ...anomaly,
        sessions: anomaly.sessions.map((s: any) => ({
          ...s,
          startTime: new Date(s.startTime),
          endTime: new Date(s.endTime)
        }))
      }));
      
      setData(parsedAnomalies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };`;

content = content.replace(fetchRegex, newBlock);
fs.writeFileSync('src/app/audit/AnomalyReport.tsx', content);

let guestContent = fs.readFileSync('src/app/audit/GuestReport.tsx', 'utf8');
const guestRegex = /const fetchData = async \(\) => \{[\s\S]*?setLoading\(false\);\s*\};/m;

const guestNewBlock = `const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(\`/api/audit/guests?dateOffset=\${dateOffset}\`);
      if (!res.ok) {
        console.error("Failed to fetch guest report");
        return;
      }
      const json = await res.json();
      
      const parsedData = (json.processed || []).map((item: any) => ({
        ...item,
        checkIn: new Date(item.checkIn),
        checkOut: new Date(item.checkOut),
        effectiveCheckOut: new Date(item.effectiveCheckOut)
      }));
      
      setData(parsedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };`;

guestContent = guestContent.replace(guestRegex, guestNewBlock);
fs.writeFileSync('src/app/audit/GuestReport.tsx', guestContent);
console.log("Replaced successfully via regex");
