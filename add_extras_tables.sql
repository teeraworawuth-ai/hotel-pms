
-- Add key_deposit to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS key_deposit NUMERIC DEFAULT 200;

-- Create booking_daily_extras table
CREATE TABLE IF NOT EXISTS booking_daily_extras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE booking_daily_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON booking_daily_extras;
DROP POLICY IF EXISTS "Enable all for anon users" ON booking_daily_extras;
CREATE POLICY "Enable all for authenticated users" ON booking_daily_extras FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON booking_daily_extras FOR ALL USING (true);
