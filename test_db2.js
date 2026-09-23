const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wkurerladxwydlrddfrv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrdXJlcmxhZHh3eWRscmRkZnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0ODk0NTEsImV4cCI6MjA5OTA2NTQ1MX0.Cx4BqT5BgNzxAHhvGMQX1voBqX8uJ44VuC_PLlsF_-E');

async function test() {
  const { data, error } = await supabase.from('rate_plans').select('*');
  console.log('rate_plans length:', data ? data.length : 0, error);
}
test();
