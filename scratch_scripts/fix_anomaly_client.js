const fs = require('fs');
let content = fs.readFileSync('src/app/audit/AnomalyReport.tsx', 'utf8');

const fetchStartIdx = content.indexOf('const fetchData = async () => {');
const fetchEndIdx = content.indexOf('setData(anomalies);');

if (fetchStartIdx !== -1 && fetchEndIdx !== -1) {
  const endBlock = content.indexOf('}', fetchEndIdx) + 1;
  const newFetchBlock = `const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(\`/api/audit/anomalies?dateOffset=\${dateOffset}\`);
      if (!res.ok) {
        console.error("Failed to fetch anomalies");
        return;
      }
      const json = await res.json();
      
      // Convert date strings back to Date objects
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
`;
  
  // We need to also skip the 'setLoading(false);' after setData(anomalies);
  // Wait, let's just replace from fetchStartIdx to the '};' ending the function.
  
  const functionEndIdx = content.indexOf('};', fetchStartIdx);
  content = content.substring(0, fetchStartIdx) + newFetchBlock + content.substring(functionEndIdx);
  
  fs.writeFileSync('src/app/audit/AnomalyReport.tsx', content);
  console.log("Updated AnomalyReport.tsx to use API");
} else {
  console.log("Could not find blocks in AnomalyReport.tsx");
}
