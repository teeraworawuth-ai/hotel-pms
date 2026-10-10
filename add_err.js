const fs = require('fs');
let content = fs.readFileSync('src/app/components/StaffSettings.tsx', 'utf8');

const targetStr = `        if (existing) {
          await supabase.from('system_settings').update({ value: newStaffLocations }).eq('key', 'staff_locations');
        } else {
          await supabase.from('system_settings').insert({ key: 'staff_locations', value: newStaffLocations });
        }`;

const newStr = `        if (existing) {
          const { error: updateErr } = await supabase.from('system_settings').update({ value: newStaffLocations }).eq('key', 'staff_locations');
          if (updateErr) console.error("Update Staff Locations Error:", updateErr);
        } else {
          const { error: insertErr } = await supabase.from('system_settings').insert({ key: 'staff_locations', value: newStaffLocations });
          if (insertErr) console.error("Insert Staff Locations Error:", insertErr);
        }`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newStr);
  fs.writeFileSync('src/app/components/StaffSettings.tsx', content, 'utf8');
  console.log('Added error logging');
} else {
  console.log('Could not find target string');
}
