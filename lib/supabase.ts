import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 연결 정보가 없으면 null. 이때는 브라우저 저장소만으로 동작한다
export const supabase = url && key ? createClient(url, key) : null;
