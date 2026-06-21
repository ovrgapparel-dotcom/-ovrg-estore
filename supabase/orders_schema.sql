-- ==========================================
-- SCHEMA: Orders & Customizer Showcase for OVRG E-Store
-- ==========================================
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    note TEXT,
    items JSONB NOT NULL, -- Holds cart array: [{ id, name, price, qty, size, img }]
    total_price INTEGER NOT NULL,
    payment_method TEXT NOT NULL, -- 'paypal', 'wave', 'yango', 'whatsapp'
    payment_reference TEXT, -- Holds the Wave SMS transaction code or transaction reference
    status TEXT DEFAULT 'En attente' CHECK (status IN ('En attente', 'En cours', 'Livré', 'Annulé'))
);

-- 2. SHOWCASE SETTINGS TABLE (Single row configuration)
CREATE TABLE IF NOT EXISTS public.showcase_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    price INTEGER DEFAULT 18000,
    sizes TEXT DEFAULT 'S, M, L, XL, XXL',
    colors JSONB DEFAULT '[
        {"name": "Blanc", "hex": "#ffffff", "front_mockup": "", "back_mockup": ""},
        {"name": "Noir", "hex": "#000000", "front_mockup": "", "back_mockup": ""},
        {"name": "Rouge", "hex": "#ef4444", "front_mockup": "", "back_mockup": ""},
        {"name": "Bleu", "hex": "#3b82f6", "front_mockup": "", "back_mockup": ""},
        {"name": "Vert", "hex": "#10b981", "front_mockup": "", "back_mockup": ""},
        {"name": "Orange", "hex": "#f59e0b", "front_mockup": "", "back_mockup": ""}
    ]'::jsonb,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 3. SHOWCASE PRINTS TABLE (For custom prints uploads)
CREATE TABLE IF NOT EXISTS public.showcase_prints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_prints ENABLE ROW LEVEL SECURITY;

-- Policies for orders
CREATE POLICY "Allow public insert to orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated read to orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated update to orders" ON public.orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete to orders" ON public.orders FOR DELETE TO authenticated USING (true);

-- Policies for showcase_settings
CREATE POLICY "Allow public read to showcase_settings" ON public.showcase_settings FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write to showcase_settings" ON public.showcase_settings FOR ALL TO authenticated USING (true);

-- Policies for showcase_prints
CREATE POLICY "Allow public read to showcase_prints" ON public.showcase_prints FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write to showcase_prints" ON public.showcase_prints FOR ALL TO authenticated USING (true);

-- ==========================================
-- SEED DATA
-- ==========================================
INSERT INTO public.showcase_settings (id, price, sizes, colors)
VALUES (1, 18000, 'S, M, L, XL, XXL', '[
    {"name": "Blanc", "hex": "#ffffff", "front_mockup": "", "back_mockup": ""},
    {"name": "Noir", "hex": "#000000", "front_mockup": "", "back_mockup": ""},
    {"name": "Rouge", "hex": "#ef4444", "front_mockup": "", "back_mockup": ""},
    {"name": "Bleu", "hex": "#3b82f6", "front_mockup": "", "back_mockup": ""},
    {"name": "Vert", "hex": "#10b981", "front_mockup": "", "back_mockup": ""},
    {"name": "Orange", "hex": "#f59e0b", "front_mockup": "", "back_mockup": ""}
]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Seed default prints
INSERT INTO public.showcase_prints (id, name, image_url)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'OVRG Classic Logo', 'https://mihpdlhbijlvbdcqvzdw.supabase.co/storage/v1/object/public/product-images/prints/classic_logo.png'),
  ('22222222-2222-2222-2222-222222222222', 'Abidjan Street Art', 'https://mihpdlhbijlvbdcqvzdw.supabase.co/storage/v1/object/public/product-images/prints/abidjan_art.png')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
