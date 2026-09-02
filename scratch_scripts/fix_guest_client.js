const fs = require('fs');
let content = fs.readFileSync('src/app/audit/GuestReport.tsx', 'utf8');

const fetchStartIdx = content.indexOf('const fetchData = async () => {');
const fetchEndIdx = content.indexOf('setData(processed);');

if (fetchStartIdx !== -1 && fetchEndIdx !== -1) {
  const endBlock = content.indexOf('}', fetchEndIdx) + 1;
  const newFetchBlock = `const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(\`/api/audit/guests?dateOffset=\${dateOffset}\`);
      if (!res.ok) {
        console.error("Failed to fetch guest report");
        return;
      }
      const json = await res.json();
      
      // Parse ISO dates back to Date objects
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
`;
  
  const functionEndIdx = content.indexOf('};', fetchStartIdx);
  content = content.substring(0, fetchStartIdx) + newFetchBlock + content.substring(functionEndIdx);
  
  fs.writeFileSync('src/app/audit/GuestReport.tsx', content);
  console.log("Updated GuestReport.tsx to use API");
} else {
  console.log("Could not find blocks in GuestReport.tsx");
}
