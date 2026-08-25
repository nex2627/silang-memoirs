import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const authHeader=req.headers.get('Authorization')||''
  const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,{global:{headers:{Authorization:authHeader}}})
  const {data:{user:caller}}=await userClient.auth.getUser()
  if(!caller)return new Response(JSON.stringify({error:'Not authenticated'}),{status:401,headers:{...cors,'Content-Type':'application/json'}})
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
  if(!serviceKey)return new Response(JSON.stringify({error:'Server misconfigured: no service role key found'}),{status:500,headers:{...cors,'Content-Type':'application/json'}})
  const adminClient=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey)
  const {data:profile}=await adminClient.from('profiles').select('role').eq('id',caller.id).single()
  if(profile?.role!=='admin')return new Response(JSON.stringify({error:'Admin only'}),{status:403,headers:{...cors,'Content-Type':'application/json'}})
  const body=await req.json(); const allowed=['admin','head_media','head_layout','head_writer','head_researcher','head_colorist','staff_media','staff_layout','staff_writer','staff_researcher','staff_colorist']
  if(!body.full_name||!body.email||!body.password||!allowed.includes(body.role))throw new Error('Missing or invalid account data')
  const {data,error}=await adminClient.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true,user_metadata:{full_name:body.full_name,role:body.role,department:body.department,position:body.position||null,avatar_url:body.avatar_url||null}})
  if(error)throw error
  return new Response(JSON.stringify({user:data.user}),{headers:{...cors,'Content-Type':'application/json'}})
 }catch(e){return new Response(JSON.stringify({error:e.message||'Server error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
})
