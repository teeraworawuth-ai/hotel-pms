const fs = require('fs');

const svg1 = `<svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="black" stroke-width="1.5" style="width: 50px; height: 50px;">
        <rect x="5" y="4" width="14" height="16" rx="1" />
        <path d="M12 4v16 M5 12h14" />
        <path d="M2 20h20" stroke-width="2" />
      </svg>`;

const svg2 = `<svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="black" stroke-width="1.5" style="width: 50px; height: 50px;">
        <rect x="8" y="10" width="8" height="10" rx="1" />
        <path d="M12 10v10 M8 15h8" />
        <path d="M6 20h12" stroke-width="2" />
      </svg>`;
      
const svg3 = `<svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="black" stroke-width="1.5" style="width: 50px; height: 50px;">
        <rect x="8" y="7" width="8" height="10" rx="1" />
        <path d="M12 7v10 M8 12h8" />
        <path d="M6 17h12" stroke-width="2" />
      </svg>`;

const html = `
<html>
<body style="display:flex; gap:20px;">
  <div>Original<br>${svg1}</div>
  <div>Baseline-aligned<br>${svg2}</div>
  <div>Centered<br>${svg3}</div>
</body>
</html>
`;

fs.writeFileSync('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\d5dba714-85b4-4471-b979-28c4a93bf4c6\\window_preview.html', html);
console.log('Preview generated');
