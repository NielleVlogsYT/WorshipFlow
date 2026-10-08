let session=null,currentProfile=null,positions=[],musicians=[],schedules=[],users=[],calendarDate=new Date(),realtimeChannel=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),3000)}
function openModal(html){$('modalBox').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden');$('modalBox').innerHTML=''}
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
function showAuth(tab='login'){$('authScreen').classList.remove('hidden');$('app').classList.add('hidden');$('loginForm').classList.toggle('hidden',tab!=='login');$('signupForm').classList.toggle('hidden',tab!=='signup');$('loginTab').classList.toggle('active',tab==='login');$('signupTab').classList.toggle('active',tab==='signup')}
$('loginTab').onclick=()=>showAuth('login');$('signupTab').onclick=()=>showAuth('signup');

function myFunction(inputId) { // fixes the show password toggle for signin and login
  const input = $(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}
async function bootstrapAccount(){
  const {data,error}=await supabaseClient.rpc('bootstrap_my_account');
  if(error) throw new Error(`Account setup failed: ${error.message}`);
  return data;
}

$('loginForm').onsubmit=async e=>{
  e.preventDefault();$('loginMsg').textContent='Signing in...';
  const {data,error}=await supabaseClient.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
  if(error){$('loginMsg').textContent=error.message;return}
  try{await boot(data.session)}catch(err){$('loginMsg').textContent=err.message}
};

$('signupForm').onsubmit=async e=>{
  e.preventDefault();
  const ids=[...document.querySelectorAll('#signupPositions input:checked')].map(x=>x.value);
  const name=$('signupName').value.trim();
  if(!name){$('signupMsg').textContent='Please enter your full name.';return}
  if(!ids.length){$('signupMsg').textContent='Choose at least one position.';return}
  $('signupMsg').textContent='Creating account...';
  const {data,error}=await supabaseClient.auth.signUp({
    email:$('signupEmail').value.trim(),
    password:$('signupPassword').value,
    options:{data:{full_name:name,position_ids:ids}}
  });
  if(error){$('signupMsg').textContent=error.message;return}
  if(data.session){
    try{await bootstrapAccount();await boot(data.session)}catch(err){$('signupMsg').textContent=err.message}
  }else{
    $('signupMsg').textContent='Account created. Check your email if confirmation is enabled, then log in.';
  }
};

$('logoutBtn').onclick=async()=>{await supabaseClient.auth.signOut()};
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('newScheduleBtn').onclick=()=>openScheduleBuilder();
$('prevMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};
$('nextMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
$('userSearch').oninput=()=>renderUsers();$('roleFilter').onchange=()=>renderUsers();

async function getPositions(){const {data,error}=await supabaseClient.from('positions').select('*').order('sort_order');if(error)throw error;return data||[]}
async function getProfile(){const {data,error}=await supabaseClient.from('profiles').select('*,musicians(id,name,active,musician_positions(position_id,positions(id,name)))').eq('id',session.user.id).single();if(error)throw error;return data}
async function getAllUsers(){const {data,error}=await supabaseClient.from('profiles').select('*,musicians(id,name,active,musician_positions(position_id,positions(id,name)))').order('name');if(error)throw error;return data||[]}
async function getMusicians(){const {data,error}=await supabaseClient.from('musicians').select('id,name,active,musician_positions(position_id,positions(id,name))').order('name');if(error)throw error;return data||[]}
async function getSchedules(){const {data,error}=await supabaseClient.from('schedules').select('*').order('service_date');if(error)throw error;return data||[]}

async function boot(s){
  if(!s)return;
  session=s;
  positions=await getPositions();
  await bootstrapAccount();
  currentProfile=await getProfile();
  if(currentProfile.status!=='active'){
    await supabaseClient.auth.signOut();
    throw new Error('Your account is inactive. Please contact an administrator.');
  }
  musicians=await getMusicians();
  schedules=await getSchedules();
  users=currentProfile.role==='admin'?await getAllUsers():[];
  $('authScreen').classList.add('hidden');$('app').classList.remove('hidden');
  $('userBadge').textContent=`${currentProfile.name} · ${currentProfile.role}`;
  document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',currentProfile.role!=='admin'));
  $('welcomeTitle').textContent=`Hello, ${(currentProfile.name||'there').split(' ')[0]}`;
  renderSignupPositions();renderDashboard();renderMyPositions();
  if(currentProfile.role==='admin'){renderUsers();renderMusicians()}
  subscribeRealtime();
}

function renderSignupPositions(){if(!$('signupPositions'))return;$('signupPositions').innerHTML=positions.map(p=>`<label class="checkbox-option"><input type="checkbox" value="${p.id}"><span>${esc(p.name)}</span></label>`).join('')}
function switchView(view){document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$(view+'View').classList.remove('hidden');document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));if(view==='calendar')renderCalendar();if(view==='lineup')renderMyLineup();if(view==='users')renderUsers();if(view==='musicians')renderMusicians()}
function renderDashboard(){const today=new Date().toISOString().slice(0,10),month=today.slice(0,7),upcoming=schedules.filter(s=>s.service_date>=today);$('statUpcoming').textContent=upcoming.length;$('statUsers').textContent=currentProfile.role==='admin'?users.length:(musicians.length||0);$('statMonth').textContent=schedules.filter(s=>s.service_date.startsWith(month)).length;$('nextServices').innerHTML=upcoming.slice(0,5).map(s=>`<div class="list-row"><div><strong>${esc(s.title)}</strong><small>${esc(s.service_date)}</small></div><div class="row-actions"><button class="btn btn-secondary" onclick="viewSchedule('${s.id}')">View</button>${currentProfile.role==='admin'?`<button class="btn btn-secondary" onclick="editSchedule('${s.id}')">Edit</button>`:''}</div></div>`).join('')||'<p class="muted">No upcoming schedules.</p>'}
function renderMyPositions(){const ps=currentProfile.musicians?.musician_positions||[];$('myPositions').innerHTML=ps.map(x=>`<span class="pill">${esc(x.positions.name)}</span>`).join('')||'<p class="muted">No positions assigned.</p>'}

function isServiceDateAllowed(value){if(!value)return false;const [year,month,day]=value.split('-').map(Number);return [0,4].includes(new Date(year,month-1,day).getDay())}
function validateServiceDate(input){if(!input.value||isServiceDateAllowed(input.value)){input.setCustomValidity('');return true}input.setCustomValidity('Services can only be scheduled on Sundays or Thursdays.');toast('Services can only be scheduled on Sundays or Thursdays.');return false}
function nextServiceDate(){const date=new Date();while(!isServiceDateAllowed(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`))date.setDate(date.getDate()+1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}

async function viewSchedule(id){const s=schedules.find(x=>x.id===id);if(!s)return;const {data,error}=await supabaseClient.from('schedule_assignments').select('position_id,musician_id,positions(name),musicians(name)').eq('schedule_id',id).order('position_id');if(error)return toast(error.message);openModal(`<div class="modal-head"><div><p class="eyebrow">LINEUP</p><h3>${esc(s.title)}</h3><p class="muted">${esc(s.service_date)}</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="lineup-grid">${(data||[]).map(a=>`<div class="lineup-card"><span>${esc(a.positions.name)}</span><strong>${esc(a.musicians.name)}</strong></div>`).join('')||'<p class="muted">No assignments yet.</p>'}</div>`)}

function renderCalendar(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();$('calendarTitle').textContent=calendarDate.toLocaleString(undefined,{month:'long',year:'numeric'});let h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="cal-label">${x}</div>`).join('');for(let i=0;i<first;i++)h+='<div class="cal-cell empty"></div>';for(let d=1;d<=days;d++){const date=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,ss=schedules.filter(s=>s.service_date===date);h+=`<div class="cal-cell"><b>${d}</b>${ss.map(s=>`<button class="event" onclick="viewSchedule('${s.id}')">${esc(s.title)}</button>`).join('')}</div>`}$('calendar').innerHTML=h}

async function renderMyLineup(){const myId=currentProfile.musician_id;if(!myId){$('myLineup').innerHTML='<p class="muted">No musician profile linked.</p>';return}const {data,error}=await supabaseClient.from('schedule_assignments').select('schedule_id,position_id,positions(name),schedules(id,title,service_date)').eq('musician_id',myId);if(error){$('myLineup').innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}const map={};(data||[]).forEach(x=>(map[x.schedule_id]??=[]).push(x));const items=Object.values(map).filter(a=>a[0].schedules.service_date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a[0].schedules.service_date.localeCompare(b[0].schedules.service_date));$('myLineup').innerHTML=items.map(a=>`<div class="glass-card schedule-item"><div><h3>${esc(a[0].schedules.title)}</h3><p>${esc(a[0].schedules.service_date)}</p></div><div>${a.map(x=>`<span class="pill">${esc(x.positions.name)}</span>`).join('')}</div></div>`).join('')||'<p class="muted">You have no upcoming assignments.</p>'}

async function openScheduleBuilder(){const today=nextServiceDate();openModal(`<div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>New Worship Schedule</h3></div><button class="close-btn" onclick="closeModal()">×</button></div><label>Schedule title</label><input id="nsTitle" class="input" placeholder="1st Week of October"><label>Service date</label><input id="nsDate" type="date" class="input" value="${today}" onchange="validateServiceDate(this)" required><small class="muted">Services are available on Sundays and Thursdays only.</small><label>Lineup</label><div id="nsAssignments"></div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewSchedule()">Create & Save</button></div>`);renderBuilderRows()}
function renderBuilderRows(){
  $('nsAssignments').innerHTML=positions.map(p=>`<div class="assignment-row"><label>${esc(p.name)}</label><select class="input ns-select" data-position="${p.id}"><option value="">-- Select Musician --</option>${musicians.filter(m=>m.active&&m.musician_positions.some(x=>x.position_id===p.id)).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>`).join('');
  document.querySelectorAll('.ns-select').forEach(sel=>sel.addEventListener('change',checkBuilderDuplicates));
}
function renderEditRows(assignments){
  const assignedByPosition=Object.fromEntries((assignments||[]).map(a=>[a.position_id,a.musician_id]));
  $('esAssignments').innerHTML=positions.map(p=>{const assignedId=assignedByPosition[p.id]||'';return `<div class="assignment-row"><label>${esc(p.name)}</label><select class="input es-select" data-position="${p.id}"><option value="">-- Select Musician --</option>${musicians.filter(m=>m.active||m.id===assignedId).filter(m=>m.musician_positions.some(x=>x.position_id===p.id)).map(m=>`<option value="${m.id}" ${m.id===assignedId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div>`}).join('');
  document.querySelectorAll('.es-select').forEach(sel=>sel.addEventListener('change',()=>checkBuilderDuplicates('es')));
}
function checkBuilderDuplicates(prefix='ns'){const used={},duplicates=new Set();document.querySelectorAll(`.${prefix}-select`).forEach(s=>{if(s.value){if(used[s.value])duplicates.add(s.value);used[s.value]=s.dataset.position}});document.querySelectorAll(`.${prefix}-select`).forEach(s=>s.classList.toggle('conflict',duplicates.has(s.value)));return duplicates.size===0}
async function saveNewSchedule(){const title=$('nsTitle').value.trim(),date=$('nsDate').value;if(!title||!date)return toast('Schedule title and date are required.');if(!isServiceDateAllowed(date))return toast('Services can only be scheduled on Sundays or Thursdays.');if(!checkBuilderDuplicates())return toast('A musician cannot be assigned to two positions in the same schedule.');const {data:s,error}=await supabaseClient.from('schedules').insert({title,service_date:date}).select().single();if(error)return toast(error.message);const rows=[...document.querySelectorAll('.ns-select')].filter(x=>x.value).map(x=>({schedule_id:s.id,position_id:x.dataset.position,musician_id:x.value}));if(rows.length){const {error:e}=await supabaseClient.from('schedule_assignments').insert(rows);if(e){await supabaseClient.from('schedules').delete().eq('id',s.id);return toast(e.message)}}closeModal();schedules=await getSchedules();renderDashboard();renderCalendar();toast('Schedule created.')}
async function editSchedule(id){if(currentProfile.role!=='admin')return;const s=schedules.find(x=>x.id===id);if(!s)return;const {data,error}=await supabaseClient.from('schedule_assignments').select('position_id,musician_id').eq('schedule_id',id);if(error)return toast(error.message);openModal(`<div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>Edit Worship Schedule</h3></div><button class="close-btn" onclick="closeModal()">×</button></div><label>Schedule title</label><input id="esTitle" class="input" value="${esc(s.title)}"><label>Service date</label><input id="esDate" type="date" class="input" value="${esc(s.service_date)}" onchange="validateServiceDate(this)" required><small class="muted">Services are available on Sundays and Thursdays only.</small><label>Lineup</label><div id="esAssignments"></div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveEditedSchedule('${id}')">Save Changes</button></div>`);renderEditRows(data||[])}
async function saveEditedSchedule(id){if(currentProfile?.role!=='admin')return toast('Only administrators can edit services.');const title=$('esTitle').value.trim(),date=$('esDate').value;if(!title||!date)return toast('Schedule title and date are required.');if(!isServiceDateAllowed(date))return toast('Services can only be scheduled on Sundays or Thursdays.');if(!checkBuilderDuplicates('es'))return toast('A musician cannot be assigned to two positions in the same schedule.');const {error}=await supabaseClient.from('schedules').update({title,service_date:date}).eq('id',id);if(error)return toast(error.message);const {error:deleteError}=await supabaseClient.from('schedule_assignments').delete().eq('schedule_id',id);if(deleteError)return toast(deleteError.message);const rows=[...document.querySelectorAll('.es-select')].filter(x=>x.value).map(x=>({schedule_id:id,position_id:x.dataset.position,musician_id:x.value}));if(rows.length){const {error:insertError}=await supabaseClient.from('schedule_assignments').insert(rows);if(insertError)return toast(insertError.message)}closeModal();schedules=await getSchedules();renderDashboard();renderCalendar();renderMyLineup();toast('Schedule updated.')}

async function renderUsers(){if(currentProfile.role!=='admin')return;users=await getAllUsers();const q=($('userSearch').value||'').toLowerCase(),r=$('roleFilter').value;const rows=users.filter(u=>(!q||u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))&&(!r||u.role===r));$('usersTable').innerHTML=`<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Positions</th><th>Actions</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="pill">${esc(u.role)}</span></td><td><span class="pill">${esc(u.status)}</span></td><td>${(u.musicians?.musician_positions||[]).map(x=>esc(x.positions.name)).join(', ')||'—'}</td><td><button class="btn btn-secondary" onclick="editUser('${u.id}')">Edit</button></td></tr>`).join('')}</tbody></table>`;$('statUsers').textContent=users.length}
async function editUser(id){const u=users.find(x=>x.id===id);if(!u)return;openModal(`<div class="modal-head"><h3>Edit User</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="euName" class="input" value="${esc(u.name)}"><label>Email</label><input class="input" value="${esc(u.email)}" disabled><label>Role</label><select id="euRole" class="input"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select><label>Status</label><select id="euStatus" class="input"><option value="active" ${u.status==='active'?'selected':''}>Active</option><option value="inactive" ${u.status==='inactive'?'selected':''}>Inactive</option></select><label>Dedicated positions</label><div id="euPos" class="checkbox-grid compact">${positions.map(p=>{const yes=(u.musicians?.musician_positions||[]).some(x=>x.position_id===p.id);return `<label class="checkbox-option"><input type="checkbox" value="${p.id}" ${yes?'checked':''}><span>${esc(p.name)}</span></label>`}).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveUser('${id}')">Save</button></div>`)}
async function saveUser(id){const u=users.find(x=>x.id===id),name=$('euName').value.trim(),role=$('euRole').value,status=$('euStatus').value,ids=[...document.querySelectorAll('#euPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and at least one position are required.');const {error}=await supabaseClient.from('profiles').update({name,role,status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message);if(u.musician_id){const {error:e1}=await supabaseClient.from('musicians').update({name,active:status==='active'}).eq('id',u.musician_id);if(e1)return toast(e1.message);const {error:e2}=await supabaseClient.from('musician_positions').delete().eq('musician_id',u.musician_id);if(e2)return toast(e2.message);const {error:e3}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:u.musician_id,position_id})));if(e3)return toast(e3.message)}closeModal();await boot(session);switchView('users');toast('User updated.')}

function renderMusicians(){if(currentProfile.role!=='admin')return;$('musicianList').innerHTML=musicians.map(m=>`<div class="list-row"><div><strong>${esc(m.name)}</strong><small>${(m.musician_positions||[]).map(x=>esc(x.positions.name)).join(', ')||'No positions'} ${m.active?'':'· Archived'}</small></div><div class="row-actions"><button class="btn btn-secondary" onclick="editMusician('${m.id}')">Edit</button><button class="btn btn-danger" onclick="deleteMusician('${m.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No musicians.</p>'}
async function editMusician(id){const m=musicians.find(x=>x.id===id);if(!m)return;openModal(`<div class="modal-head"><h3>Edit Musician</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="emName" class="input" value="${esc(m.name)}"><label>Dedicated positions</label><div id="emPos" class="checkbox-grid compact">${positions.map(p=>{const yes=(m.musician_positions||[]).some(x=>x.position_id===p.id);return `<label class="checkbox-option"><input type="checkbox" value="${p.id}" ${yes?'checked':''}><span>${esc(p.name)}</span></label>`}).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveMusician('${id}')">Save</button></div>`)}
async function saveMusician(id){const m=musicians.find(x=>x.id===id),name=$('emName').value.trim(),ids=[...document.querySelectorAll('#emPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and at least one position are required.');const {error}=await supabaseClient.from('musicians').update({name}).eq('id',id);if(error)return toast(error.message);const {error:e1}=await supabaseClient.from('musician_positions').delete().eq('musician_id',id);if(e1)return toast(e1.message);const {error:e2}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:id,position_id})));if(e2)return toast(e2.message);closeModal();musicians=await getMusicians();renderMusicians();if(currentProfile.musician_id===id){currentProfile=await getProfile();renderMyPositions()}toast('Musician updated.')}
async function deleteMusician(id){const m=musicians.find(x=>x.id===id);if(!m)return;openModal(`<div class="confirm"><div class="danger-icon">!</div><h3>Delete musician?</h3><p>Are you sure you want to remove <strong>${esc(m.name)}</strong>? They will be archived and removed from future scheduling. Existing schedules remain intact.</p><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmDelete('${id}')">Yes, Delete</button></div></div>`)}
async function confirmDelete(id){const {error}=await supabaseClient.from('musicians').update({active:false}).eq('id',id);if(error)return toast(error.message);await supabaseClient.from('profiles').update({status:'inactive',updated_at:new Date().toISOString()}).eq('musician_id',id);closeModal();musicians=await getMusicians();renderMusicians();toast('Musician archived.')}
$('addMusicianBtn').onclick=()=>openModal(`<div class="modal-head"><h3>Add Musician</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="amName" class="input"><label>Positions</label><div id="amPos" class="checkbox-grid compact">${positions.map(p=>`<label class="checkbox-option"><input type="checkbox" value="${p.id}"><span>${esc(p.name)}</span></label>`).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewMusician()">Save</button></div>`);
async function saveNewMusician(){const name=$('amName').value.trim(),ids=[...document.querySelectorAll('#amPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and position are required.');const {data,error}=await supabaseClient.from('musicians').insert({name}).select().single();if(error)return toast(error.message);const {error:e}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:data.id,position_id})));if(e){await supabaseClient.from('musicians').delete().eq('id',data.id);return toast(e.message)}closeModal();musicians=await getMusicians();renderMusicians();toast('Musician added.')}

function subscribeRealtime(){if(realtimeChannel)return;realtimeChannel=supabaseClient.channel('worshipflow-v4-live').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},async()=>{schedules=await getSchedules();renderDashboard();renderCalendar();renderMyLineup()}).on('postgres_changes',{event:'*',schema:'public',table:'schedule_assignments'},async()=>{renderMyLineup()}).on('postgres_changes',{event:'*',schema:'public',table:'musicians'},async()=>{musicians=await getMusicians();if(currentProfile?.role==='admin')renderMusicians();renderMyPositions()}).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},async()=>{if(session){try{currentProfile=await getProfile();renderDashboard();renderMyPositions();document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',currentProfile.role!=='admin'))}catch(e){console.warn(e)}}}).subscribe()}

supabaseClient.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_OUT'){session=null;currentProfile=null;if(realtimeChannel){await supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null}showAuth('login');return}if(s&&event!=='INITIAL_SESSION'){try{await boot(s)}catch(e){console.error(e);toast(e.message)}}});

(async()=>{try{positions=await getPositions()}catch(e){console.error(e);positions=[]}renderSignupPositions();const {data}=await supabaseClient.auth.getSession();if(data.session){try{await boot(data.session)}catch(e){console.error(e);showAuth('login');toast(e.message)}}else showAuth('login')})();
