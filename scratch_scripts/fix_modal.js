const fs = require('fs');
let content = fs.readFileSync('src/app/components/EnergyGraph.tsx', 'utf8');

// Update Props
content = content.replace(
  'interface EnergyGraphProps {\n  roomId: string;\n  dateOffset?: number;\n}',
  'interface EnergyGraphProps {\n  roomId: string;\n  roomNo?: string;\n  location?: string;\n  dateOffset?: number;\n}'
);

content = content.replace(
  'export default function EnergyGraph({ roomId, dateOffset = 0 }: EnergyGraphProps) {',
  'export default function EnergyGraph({ roomId, roomNo, location, dateOffset = 0 }: EnergyGraphProps) {'
);

// Update Modal Header
const oldHeader = `<div className="flex justify-between items-start md:items-center p-4 md:p-6 border-b border-slate-200 bg-white shrink-0 shadow-sm">
            <div className="pr-4">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">กราฟการใช้ไฟ - ห้อง {roomId.substring(0,4)}...</h2>
              <p className="text-slate-500 text-xs md:text-sm mt-1">คลิกซ้าย/ถ่างนิ้ว เพื่อซูมเข้า (ระดับ {zoomLevel}/4) • คลิกขวา/หุบนิ้ว เพื่อซูมออก</p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-2 md:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors flex items-center gap-2 shrink-0 z-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด (Close)</span>
            </button>
          </div>`;

const newHeader = `<div className="flex justify-between items-center p-2 md:p-6 border-b border-slate-200 bg-white shrink-0 shadow-sm">
            <div className="pr-2">
              <h2 className="text-sm md:text-2xl font-black text-slate-800 leading-tight">
                {location ? \`\${location} - ห้อง \${roomNo || roomId}\` : \`กราฟการใช้ไฟ - ห้อง \${roomNo || roomId}\`}
              </h2>
              <p className="text-slate-500 text-[10px] md:text-sm mt-0.5 hidden md:block">คลิกซ้าย/ถ่างนิ้ว เพื่อซูมเข้า (ระดับ {zoomLevel}/4) • คลิกขวา/หุบนิ้ว เพื่อซูมออก</p>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-1.5 md:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors flex items-center gap-2 shrink-0 z-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              <span className="font-bold text-sm hidden md:inline">ปิด</span>
            </button>
          </div>`;

content = content.replace(oldHeader, newHeader);

// Update Modal Body Container and hide navigation controls on mobile
const oldBodyStart = `<div className="flex-1 p-2 pb-6 md:p-6 md:pb-8 min-h-[300px] bg-slate-50 flex flex-col relative overflow-hidden">
             {/* Navigation controls */}
             <div className="flex justify-between items-center mb-3 md:mb-4 px-2 shrink-0">`;

const newBodyStart = `<div className="flex-1 p-1 pb-1 md:p-6 md:pb-8 min-h-0 md:min-h-[300px] bg-slate-50 flex flex-col relative overflow-hidden">
             {/* Navigation controls - Hidden on mobile to maximize graph space */}
             <div className="hidden md:flex justify-between items-center mb-4 px-2 shrink-0">`;

content = content.replace(oldBodyStart, newBodyStart);

// Update the Graph container padding on mobile
const oldGraphContainer = `<div className="h-full p-2 pb-8 md:p-6 md:pb-12 relative min-w-full inline-block">`;
const newGraphContainer = `<div className="h-full p-0 pb-4 md:p-6 md:pb-12 relative min-w-full inline-block">`;

content = content.replace(oldGraphContainer, newGraphContainer);

fs.writeFileSync('src/app/components/EnergyGraph.tsx', content, 'utf8');
