// js/supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Substitua com as suas credenciais do projeto Supabase
const SUPABASE_URL = 'https://xiziyothphnyifyftrwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpeml5b3RocGhueWlmeWZ0cnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODIyNzMsImV4cCI6MjA5Mzc1ODI3M30.SvtyhOAmITW__d8GeA2DTNB5_bpmwodClH62Jk4bHbk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
