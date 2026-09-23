const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

c = c.replace(/const newMap = \{ \.\.\.roomOptionsMap \};[\s\r\n]*if \(savedRoomId\) \{/, 
`const newMap = { ...roomOptionsMap };
    if (savedRoomId) {
      const newIconMap = { ...roomIconsMap };
      if (formIcons.length > 0) newIconMap[savedRoomId] = formIcons;
      else delete newIconMap[savedRoomId];
      await supabase.from("system_settings").upsert({ key: "room_icons_map", value: newIconMap });
      setRoomIconsMap(newIconMap);
`);

fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Fixed missing save logic for room icons');
