const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

const customTooltipCode = `
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const watt = payload[0].value;
      
      return (
        <div className="bg-slate-800 text-white p-3 rounded-xl shadow-lg border border-slate-700 text-sm z-50">
          <p className="font-bold text-blue-300 mb-1">{timeStr}</p>
          <p className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
             <span>กำลังไฟ: <span className="font-bold">{watt} W</span></span>
          </p>
        </div>
      );
    }
    return null;
  };
`;

// Insert the custom tooltip component before renderGraph
content = content.replace('const renderGraph = (baseHeight: number | string, isExpanded: boolean) => {', customTooltipCode + '\n  const renderGraph = (baseHeight: number | string, isExpanded: boolean) => {');

// Add the Tooltip into LineChart
const lineChartStart = '<LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: isExpanded ? 15 : 5 }}>';
content = content.replace(lineChartStart, lineChartStart + '\n            <Tooltip content={<CustomTooltip />} cursor={{ stroke: \'#94a3b8\', strokeWidth: 1, strokeDasharray: \'3 3\' }} />');

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content);
console.log('Tooltip added');
