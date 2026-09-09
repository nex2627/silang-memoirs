import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}
const roles=['admin','head_media','head_layout','head_writer','head_researcher','head_colorist','staff_media','staff_layout','staff_writer','staff_researcher','staff_colorist']

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

  const body=await req.json()
  if(!body.userId)throw new Error('Missing userId')

  if(body.action==='reset_password'){
    if(!body.password||body.password.length<6)throw new Error('Password must be at least 6 characters')
    const {error}=await adminClient.auth.admin.updateUserById(body.userId,{password:body.password})
    if(error)throw error
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,'Content-Type':'application/json'}})
  }

  if(body.action==='update_profile'){
    if(body.role && !roles.includes(body.role))throw new Error('Invalid role')
    const patch:Record<string,unknown>={}
    if(body.full_name!==undefined)patch.full_name=body.full_name
    if(body.department!==undefined)patch.department=body.department
    if(body.role!==undefined)patch.role=body.role
    if(body.position!==undefined)patch.position=body.position
    if(body.active!==undefined)patch.active=body.active
    if(body.avatar_url!==undefined)patch.avatar_url=body.avatar_url
    const {error}=await adminClient.from('profiles').update(patch).eq('id',body.userId)
    if(error)throw error
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,'Content-Type':'application/json'}})
  }

  throw new Error('Unknown action')
 }catch(e){return new Response(JSON.stringify({error:e.message||'Server error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
})
