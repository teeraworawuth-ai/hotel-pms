const fs = require('fs');
let content = fs.readFileSync('src/app/audit/AnomalyReport.tsx', 'utf8');

const startTag = '  const fetchData = async () => {';
const endTag = '    setLoading(false);\n  };\n\n  if (loading)';

const startIdx = content.indexOf(startTag);
const endIdx = content.indexOf(endTag, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const newBlock = `  const fetchData = async () => {
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
  };

  if (loading)`;
  
  content = content.substring(0, startIdx) + newBlock + content.substring(endIdx + endTag.length);
  fs.writeFileSync('src/app/audit/AnomalyReport.tsx', content);
  console.log("Updated AnomalyReport.tsx");
} else {
  console.log("Failed AnomalyReport: ", startIdx, endIdx);
}
