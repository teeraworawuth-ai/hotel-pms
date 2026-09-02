const https = require('https');

https.get('https://hotel-pms-run.vercel.app/checkin', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const match = data.match(/<script src="(\/_next\/static\/chunks\/app\/checkin\/page-[^"]+\.js)"/);
    if (match) {
      const chunkUrl = 'https://hotel-pms-run.vercel.app' + match[1];
      console.log('Found chunk:', chunkUrl);
      https.get(chunkUrl, (chunkRes) => {
        let chunkData = '';
        chunkRes.on('data', (c) => { chunkData += c; });
        chunkRes.on('end', () => {
          if (chunkData.includes('total_charges') || chunkData.includes('105%') || chunkData.includes('z-30')) {
            console.log('YES! The deployed chunk contains our code.');
          } else {
            console.log('NO! The deployed chunk DOES NOT contain our code.');
          }
        });
      });
    } else {
      console.log('Could not find checkin page chunk in HTML.');
    }
  });
});
