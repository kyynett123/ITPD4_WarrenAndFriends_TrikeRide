import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mwvchqdzpywwxdsbqjuy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13dmNocWR6cHl3d3hmc2JxanV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjUxNjUsImV4cCI6MjEwNzMwMTE2NX0.efUOS6MFsQ5rw07dhosC3e4gWUVJMvISOIMiRzR5OMw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);