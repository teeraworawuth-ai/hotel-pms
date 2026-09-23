const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace(/<div className="grid grid-cols-2 gap-4">\\s*<div>\\s*<label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง/g, '<div className="grid grid-cols-2 gap-4">\\n                  <div>\\n                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง');

// I'll just use string replacement!
const find1 = \`<div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง *\`

const fullText = c;
const startIdx = fullText.indexOf('<div className="grid grid-cols-2 gap-4">\\n                  <div>\\n                    <label className="block text-xs font-semibold text-slate-500 mb-1">เลขห้อง *</label>');
console.log("Found1: ", startIdx !== -1);
