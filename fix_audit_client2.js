const fs = require('fs');
let content = fs.readFileSync('src/app/audit/AnomalyReport.tsx', 'utf8');

const fetchStartIdx = content.indexOf('const fetchData = async () => {');
const endMarker = '    setLoading(false);\n  };';
const fetchEndIdx = content.indexOf(endMarker, fetchStartIdx) + endMarker.length;

if (fetchStartIdx !== -1 && fetchEndIdx !== -1) {
  const newFetchBlock = `const fetchData = async () => {
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
  
  content = content.substring(0, fetchStartIdx) + newFetchBlock + content.substring(fetchEndIdx);
  fs.writeFileSync('src/app/audit/AnomalyReport.tsx', content);
  console.log("Updated AnomalyReport.tsx");
} else {
  console.log("Could not find blocks in AnomalyReport");
}

let guestContent = fs.readFileSync('src/app/audit/GuestReport.tsx', 'utf8');
const guestFetchStartIdx = guestContent.indexOf('const fetchData = async () => {');
const guestFetchEndIdx = guestContent.indexOf(endMarker, guestFetchStartIdx) + endMarker.length;

if (guestFetchStartIdx !== -1 && guestFetchEndIdx !== -1) {
  const newGuestFetchBlock = `const fetchData = async () => {
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
  
  guestContent = guestContent.substring(0, guestFetchStartIdx) + newGuestFetchBlock + guestContent.substring(guestFetchEndIdx);
  fs.writeFileSync('src/app/audit/GuestReport.tsx', guestContent);
  console.log("Updated GuestReport.tsx");
} else {
  console.log("Could not find blocks in GuestReport");
}
