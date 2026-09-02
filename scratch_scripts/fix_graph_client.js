const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const fetchStartIdx = content.indexOf('const fetchData = async () => {');
const fetchEndIdx = content.indexOf('setData(formattedData);');

if (fetchStartIdx !== -1 && fetchEndIdx !== -1) {
  const endBlock = content.indexOf('}', fetchEndIdx) + 1;
  const newFetchBlock = `const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(\`/api/energy/graph?roomId=\${roomId}&dateOffset=\${dateOffset}\`);
      if (!res.ok) {
        console.error("Failed to fetch graph data");
        return;
      }
      const json = await res.json();
      setData(json.formattedData || []);
`;
  
  content = content.substring(0, fetchStartIdx) + newFetchBlock + content.substring(endBlock);
  fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
  console.log("Updated EnergyGraph.tsx to use API");
} else {
  console.log("Could not find blocks in EnergyGraph.tsx");
}
