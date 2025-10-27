-- ============================================
-- Supabase Database Setup for BMAD-FKS
-- ============================================
-- Copy and paste this SQL into your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query

-- Create profiles table
CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  username TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample data
INSERT INTO profiles (username, full_name, email, active, role) VALUES
  ('john_doe', 'John Doe', 'john@example.com', true, 'admin'),
  ('jane_smith', 'Jane Smith', 'jane@example.com', true, 'user'),
  ('bob_jones', 'Bob Jones', 'bob@example.com', false, 'user'),
  ('alice_wilson', 'Alice Wilson', 'alice@example.com', true, 'editor'),
  ('charlie_brown', 'Charlie Brown', 'charlie@example.com', true, 'user');

-- Verify the data was inserted
SELECT * FROM profiles;

-- ============================================
-- Optional: Additional Example Tables
-- ============================================

-- Create knowledge_items table (another example)
CREATE TABLE knowledge_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT,
  tags TEXT[],
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample knowledge data
INSERT INTO knowledge_items (title, content, category, tags, created_by) VALUES
  (
    'Getting Started with BMAD-FKS',
    'This guide covers the basics of setting up and using the BMAD Federated Knowledge System.',
    'documentation',
    ARRAY['tutorial', 'getting-started', 'setup'],
    'john_doe'
  ),
  (
    'Supabase Integration Guide',
    'Learn how to integrate Supabase databases with BMAD-FKS for federated knowledge management.',
    'documentation',
    ARRAY['supabase', 'database', 'integration'],
    'jane_smith'
  ),
  (
    'Best Practices for Knowledge Management',
    'Follow these best practices to maintain a clean and organized knowledge base.',
    'guides',
    ARRAY['best-practices', 'tips'],
    'alice_wilson'
  );

-- Verify knowledge_items data
SELECT * FROM knowledge_items;
