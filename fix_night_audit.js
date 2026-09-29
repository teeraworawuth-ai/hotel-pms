const fs = require('fs');
let content = fs.readFileSync('src/app/api/cron/night-audit/route.ts', 'utf8');

const correctEnding = `        if (insertError) {
          console.error('Error posting charge:', insertError);
        } else {
          postedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, posted: postedCount, message: \`Night audit completed. Posted \${postedCount} charges.\` });`;

content = content.replace(/if \(insertError\) \{[\s\S]*?message: \`Night audit completed\. Posted \$\{postedCount\} charges\.\` \}\);/, correctEnding);

fs.writeFileSync('src/app/api/cron/night-audit/route.ts', content, 'utf8');
