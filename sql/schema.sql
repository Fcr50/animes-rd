-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.animes (
  mal_id integer NOT NULL,
  name text NOT NULL,
  genres ARRAY,
  image_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT animes_pkey PRIMARY KEY (mal_id)
);
CREATE TABLE public.group_animes (
  group_id uuid NOT NULL,
  mal_id integer NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text])),
  links jsonb DEFAULT '{}'::jsonb,
  added_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT group_animes_pkey PRIMARY KEY (group_id, mal_id),
  CONSTRAINT group_animes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_animes_mal_id_fkey FOREIGN KEY (mal_id) REFERENCES public.animes(mal_id),
  CONSTRAINT group_animes_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id)
);
CREATE TABLE public.group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  nickname text NOT NULL,
  color text NOT NULL,
  role text DEFAULT 'member'::text CHECK (role = ANY (ARRAY['admin'::text, 'member'::text])),
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id),
  CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  creator_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.legacy_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid,
  mal_id integer,
  nickname text NOT NULL,
  score numeric,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT legacy_votes_pkey PRIMARY KEY (id),
  CONSTRAINT legacy_votes_group_id_fkey1 FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT legacy_votes_mal_id_fkey FOREIGN KEY (mal_id) REFERENCES public.animes(mal_id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  nickname text,
  color text,
  bio text,
  avatar_url text,
  favorites jsonb DEFAULT '{"animes": [], "openings": []}'::jsonb,
  preferences jsonb DEFAULT '{"favorite_genre": "", "vibe": ""}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_library (
  user_id uuid NOT NULL,
  mal_id integer NOT NULL,
  last_score numeric,
  last_comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_library_pkey PRIMARY KEY (user_id, mal_id),
  CONSTRAINT user_library_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_library_mal_id_fkey FOREIGN KEY (mal_id) REFERENCES public.animes(mal_id)
);
CREATE TABLE public.votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  mal_id integer NOT NULL,
  user_id uuid,
  score numeric CHECK (score >= 0::numeric AND score <= 10::numeric),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT votes_pkey PRIMARY KEY (id),
  CONSTRAINT votes_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT votes_group_id_mal_id_fkey FOREIGN KEY (group_id) REFERENCES public.group_animes(group_id),
  CONSTRAINT votes_group_id_mal_id_fkey FOREIGN KEY (mal_id) REFERENCES public.group_animes(group_id),
  CONSTRAINT votes_group_id_mal_id_fkey FOREIGN KEY (group_id) REFERENCES public.group_animes(mal_id),
  CONSTRAINT votes_group_id_mal_id_fkey FOREIGN KEY (mal_id) REFERENCES public.group_animes(mal_id)
);
CREATE TABLE public.comment_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  mal_id integer NOT NULL,
  vote_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comment_reactions_pkey PRIMARY KEY (id),
  CONSTRAINT comment_reactions_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES public.votes(id) ON DELETE CASCADE,
  CONSTRAINT comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT comment_reactions_unique UNIQUE (vote_id, user_id)
);

-- RLS Policies for comment_reactions:
-- ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON public.comment_reactions FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users" ON public.comment_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Enable update for users based on user_id" ON public.comment_reactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Enable delete for users based on user_id" ON public.comment_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
