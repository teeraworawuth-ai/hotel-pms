CREATE TABLE IF NOT EXISTS extra_charge_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    charge_type TEXT NOT NULL CHECK (charge_type IN ('per_night', 'one_time')),
    ui_type TEXT NOT NULL CHECK (ui_type IN ('quick_button', 'dropdown')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE extra_charge_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON extra_charge_settings FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON extra_charge_settings FOR ALL USING (true);

-- Insert some default values
INSERT INTO extra_charge_settings (name, price, charge_type, ui_type, is_active) VALUES
('เตียงเสริม', 300, 'per_night', 'quick_button', true),
('คนเพิ่ม', 150, 'per_night', 'quick_button', true),
('เช่ามอเตอร์ไซค์', 250, 'per_night', 'dropdown', true),
('ผ้าเช็ดตัวเพิ่ม', 50, 'one_time', 'dropdown', true);
