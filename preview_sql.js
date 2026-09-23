import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://wkurerladxwydlrddfrv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrdXJlcmxhZHh3eWRscmRkZnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0ODk0NTEsImV4cCI6MjA5OTA2NTQ1MX0.Cx4BqT5BgNzxAHhvGMQX1voBqX8uJ44VuC_PLlsF_-E');

async function testSQL() {
  const fs = require('fs');
  const sql = fs.readFileSync('supabase/migrations/phase_2_smart_pricing.sql', 'utf8');
  console.log("SQL to execute:\\n", sql);
}
testSQL();
