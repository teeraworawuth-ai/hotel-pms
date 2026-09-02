const fs = require('fs');
let content = fs.readFileSync('src/app/energy/page.tsx', 'utf8');

content = content.replace(/360000/g, '720000'); // Change 6 mins to 12 mins
content = content.replace(/6 นาที/g, '12 นาที'); 

fs.writeFileSync('src/app/energy/page.tsx', content);
console.log("EnergyPage updated.");
