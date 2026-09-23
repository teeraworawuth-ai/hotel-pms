const fs = require('fs');
let c = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

const target = `    // Fetch locations order
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .single();`;

const replacement = `    // Fetch system settings
    const { data: allSettings } = await supabase
      .from("system_settings")
      .select("*");
      
    let settingsData = null;
    if (allSettings) {
      const locOrder = allSettings.find(s => s.key === "locations_order");
      if (locOrder) settingsData = locOrder;
      
      const rTypes = allSettings.find(s => s.key === "room_types")?.value;
      if (rTypes) setSavedRoomTypes(rTypes);
      
      const rOpts = allSettings.find(s => s.key === "room_options")?.value;
      if (rOpts) setSavedRoomOptions(rOpts);
      
      const rIcons = allSettings.find(s => s.key === "room_icons_map")?.value;
      if (rIcons) setRoomIconsMap(rIcons);
      
      const rOptsMap = allSettings.find(s => s.key === "room_options_map")?.value;
      if (rOptsMap) setRoomOptionsMap(rOptsMap);
    }`;

c = c.replace(target, replacement);
fs.writeFileSync('src/app/settings/page.tsx', c, 'utf8');
console.log('Settings fetch patched');
