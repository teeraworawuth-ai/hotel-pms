const fs = require('fs');
const content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

function checkBrackets(text) {
    const stack = [];
    let line = 1;
    let col = 1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (char === '\n') {
            line++;
            col = 1;
            continue;
        }

        if (char === '{' || char === '(' || char === '<') {
            stack.push({ char, line, col });
        } else if (char === '}' || char === ')' || char === '>') {
            const last = stack[stack.length - 1];
            if (!last) {
                console.log(`Unmatched closing ${char} at line ${line}, col ${col}`);
                return;
            }
            if ((char === '}' && last.char === '{') ||
                (char === ')' && last.char === '(') ||
                (char === '>' && last.char === '<')) {
                stack.pop();
            } else {
                // Mismatch, might be normal for < > in math, but let's just count { and }
            }
        }
        col++;
    }
}

// Just count { and }
let openB = 0;
let closeB = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') openB++;
  if (content[i] === '}') closeB++;
}
console.log('Open:', openB, 'Close:', closeB);
