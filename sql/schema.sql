-- SQL Schema for Anime RD Platform (Recursion-Free with Security Functions)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Groups Table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Group Members Table
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  color TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- 4. Animes Table
CREATE TABLE IF NOT EXISTS animes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  mal_id INTEGER,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Votes Table
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id UUID REFERENCES animes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  score NUMERIC CHECK (score >= 0 AND score <= 10),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(anime_id, user_id)
);

-- ========== SECURITY FUNCTIONS (TO BREAK RECURSION) ==========

-- Esta função verifica se o usuário atual é membro de um grupo específico.
-- SECURITY DEFINER permite que ela ignore o RLS para realizar a checagem.
CREATE OR REPLACE FUNCTION public.check_is_group_member(target_group_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE group_id = target_group_id 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_is_group_admin(target_group_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE group_id = target_group_id 
    AND user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== Row Level Security (RLS) ==========

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- 1. Profiles
CREATE POLICY "Profiles select" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Profiles update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Groups
CREATE POLICY "Groups select" ON groups FOR SELECT 
USING (creator_id = auth.uid() OR check_is_group_member(id));

CREATE POLICY "Groups insert" ON groups FOR INSERT 
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Groups update" ON groups FOR UPDATE 
USING (auth.uid() = creator_id);

-- 3. Group Members
CREATE POLICY "Members select" ON group_members FOR SELECT 
USING (user_id = auth.uid() OR check_is_group_member(group_id));

CREATE POLICY "Members insert" ON group_members FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update" ON group_members FOR UPDATE 
USING (user_id = auth.uid());

-- 4. Animes
CREATE POLICY "Animes select" ON animes FOR SELECT 
USING (check_is_group_member(group_id));

CREATE POLICY "Animes insert" ON animes FOR INSERT 
WITH CHECK (check_is_group_member(group_id));

CREATE POLICY "Animes update" ON animes FOR UPDATE 
USING (check_is_group_admin(group_id));

-- 5. Votes
CREATE POLICY "Votes select" ON votes FOR SELECT 
USING (EXISTS (SELECT 1 FROM animes WHERE id = anime_id AND check_is_group_member(group_id)));

CREATE POLICY "Votes all" ON votes FOR ALL 
USING (auth.uid() = user_id);

-- ========== Auto-Approval Logic (Trigger) ==========

CREATE OR REPLACE FUNCTION approve_anime_if_voted()
RETURNS TRIGGER AS $$
DECLARE
    voter_count INT;
    member_count INT;
    anime_group_id UUID;
BEGIN
    SELECT group_id INTO anime_group_id FROM animes WHERE id = NEW.anime_id;
    SELECT COUNT(DISTINCT user_id) INTO voter_count FROM votes WHERE anime_id = NEW.anime_id;
    SELECT COUNT(*) INTO member_count FROM group_members WHERE group_id = anime_group_id;
    
    IF voter_count >= member_count THEN
        UPDATE animes SET status = 'approved' WHERE id = NEW.anime_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_vote_added ON votes;
CREATE TRIGGER on_vote_added
  AFTER INSERT OR UPDATE ON votes
  FOR EACH ROW EXECUTE PROCEDURE approve_anime_if_voted();
