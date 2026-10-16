let session=null,currentProfile=null,positions=[],musicians=[],schedules=[],users=[],scheduleConflicts={},scheduleConflictError='',scheduleConflictRequest=0,schedulePreviewRequest=0,myLineupRenderRequest=0,scheduleAvailabilityCache=new Map(),myLineupCache=null,calendarDate=new Date(),availabilityCalendarDate=new Date(),availabilitySelectedStatus=null,availabilityRenderToken=0,availabilitySavedStatuses={},availabilityPendingChanges={},modalEditSnapshot=null,modalHistoryGuard=false,discardConfirmationOpen=false,realtimeChannel=null,editingScheduleAssignments=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),3000)}
function openModal(html){modalEditSnapshot=null;discardConfirmationOpen=false;releaseModalHistoryGuard();$('modalBox').innerHTML=html;$('modal').classList.remove('hidden')}
function captureModalForm(){return JSON.stringify([...$('modalBox').querySelectorAll('input,select,textarea')].map(input=>[input.type==='checkbox'||input.type==='radio'?input.checked:input.value]))}
function modalHasUnsavedChanges(){return modalEditSnapshot!==null&&captureModalForm()!==modalEditSnapshot}
function hasUnsavedChanges(){return modalHasUnsavedChanges()||Object.keys(availabilityPendingChanges).length>0}
function armModalUnsavedChangesGuard(){modalEditSnapshot=captureModalForm();armHistoryGuard()}
function armHistoryGuard(){if(!modalHistoryGuard){history.pushState({...history.state,worshipFlowEditGuard:true},'',location.href);modalHistoryGuard=true}}
function releaseModalHistoryGuard(){if(modalHistoryGuard){modalHistoryGuard=false;history.back()}}
function dismissModal(){modalEditSnapshot=null;discardConfirmationOpen=false;$('modal').classList.add('hidden');$('modalBox').innerHTML='';releaseModalHistoryGuard()}
function closeModal(){if(discardConfirmationOpen)return;if(modalHasUnsavedChanges()){showDiscardConfirmation(dismissModal);return}dismissModal()}
function showDiscardConfirmation(onDiscard){if(discardConfirmationOpen)return;discardConfirmationOpen=true;const overlay=document.createElement('div');overlay.className='discard-confirm-overlay';overlay.innerHTML='<div class="discard-confirm-card"><div class="danger-icon">!</div><h3>Discard unsaved changes?</h3><p>Your changes have not been saved. Do you want to leave and discard them?</p><div class="form-actions"><button class="btn btn-secondary" data-discard-stay>Keep Editing</button><button class="btn btn-danger" data-discard-confirm>Discard Changes</button></div></div>';overlay.querySelector('[data-discard-stay]').onclick=()=>{overlay.remove();discardConfirmationOpen=false;if(!$('modalBox').children.length)$('modal').classList.add('hidden')};overlay.querySelector('[data-discard-confirm]').onclick=()=>{overlay.remove();discardConfirmationOpen=false;onDiscard()};document.body.append(overlay);$('modal').classList.remove('hidden')}
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
window.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!$('passwordResetDialog').classList.contains('hidden'))closePasswordResetDialog();
  else if(!$('modal').classList.contains('hidden'))closeModal();
});
window.addEventListener('beforeunload',event=>{if(hasUnsavedChanges()){event.preventDefault();event.returnValue=''}});
window.addEventListener('popstate',()=>{if(!modalHistoryGuard)return;modalHistoryGuard=false;if(hasUnsavedChanges()){history.pushState({...history.state,worshipFlowEditGuard:true},'',location.href);modalHistoryGuard=true;showDiscardConfirmation(discardUnsavedChanges);return}dismissModal()});
function showWelcome(){showAuth('login');$('authScreen').classList.remove('login-open')}
function showAuth(mode='login'){
  $('authScreen').classList.add('login-open');
  $('authScreen').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('loginForm').classList.toggle('hidden',mode!=='login');
  $('signupForm').classList.toggle('hidden',mode!=='signup');
  $('recoveryForm').classList.toggle('hidden',mode!=='recovery');
}
$('continueAuth').onclick=()=>showAuth('login');
$('signupLink').onclick=()=>showAuth('signup');
$('loginLink').onclick=()=>showAuth('login');
document.querySelectorAll('.password-toggle').forEach(button=>button.onclick=()=>{
  const input=$(button.dataset.passwordTarget);
  if(!input)return;
  const visible=input.type==='password';
  input.type=visible?'text':'password';
  button.classList.toggle('is-visible',visible);
  button.setAttribute('aria-label',visible?'Hide password':'Show password');
  button.setAttribute('aria-pressed',String(visible));
});
$('profilePasswordForm').addEventListener('reset',()=>{
  document.querySelectorAll('#profilePasswordForm .password-toggle').forEach(button=>{
    const input=$(button.dataset.passwordTarget);
    if(!input)return;
    input.type='password';
    button.classList.remove('is-visible');
    button.setAttribute('aria-label','Show password');
    button.setAttribute('aria-pressed','false');
  });
});

function closePasswordResetDialog(){
  $('passwordResetDialog').classList.add('hidden');
  $('forgotPassword').focus();
}
$('forgotPassword').onclick=()=>{
  $('passwordResetEmail').value=$('loginEmail').value.trim();
  $('passwordResetMessage').textContent='';
  $('passwordResetSubmit').disabled=false;
  $('passwordResetSubmit').textContent='Send reset email';
  $('passwordResetDialog').classList.remove('hidden');
  $('passwordResetEmail').focus();
};
$('closePasswordReset').onclick=closePasswordResetDialog;
$('passwordResetDialog').addEventListener('click',event=>{
  if(event.target===$('passwordResetDialog'))closePasswordResetDialog();
});
$('passwordResetForm').onsubmit=async event=>{
  event.preventDefault();
  const email=$('passwordResetEmail').value.trim();
  if(!$('passwordResetEmail').checkValidity()){$('passwordResetEmail').reportValidity();return}
  $('passwordResetSubmit').disabled=true;
  $('passwordResetSubmit').textContent='Sending...';
  $('passwordResetMessage').textContent='Sending password reset email...';
  try{
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.href.split('#')[0]});
    if(error)throw new Error(error.message);
    $('passwordResetMessage').textContent='If an account exists for this email, a password reset link is on its way.';
    $('passwordResetSubmit').textContent='Email sent';
  }catch(error){
    $('passwordResetMessage').textContent=`Unable to send reset email: ${error.message}`;
    $('passwordResetSubmit').disabled=false;
    $('passwordResetSubmit').textContent='Try again';
  }
};

$('recoveryForm').onsubmit=async e=>{
  e.preventDefault();
  const password=$('recoveryPassword').value;
  if(password!==$('recoveryPasswordConfirm').value){$('recoveryMsg').textContent='The passwords do not match.';return}
  $('recoveryMsg').textContent='Updating password...';
  let data,error;
  try{({data,error}=await supabaseClient.auth.updateUser({password}))}
  catch(err){$('recoveryMsg').textContent=`Unable to update password: ${err.message}`;return}
  if(error){$('recoveryMsg').textContent=`Unable to update password: ${error.message}`;return}
  $('recoveryMsg').textContent='Password updated. Signing you in...';
  try{
    const {data:sessionData,error:sessionError}=await supabaseClient.auth.getSession();
    if(sessionError)throw sessionError;
    if(!sessionData.session)throw new Error('Password updated. Please log in with your new password.');
    await boot(sessionData.session);
  }catch(err){$('recoveryMsg').textContent=err.message}
};
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
  const email=$('signupEmail').value.trim();
  if(!name){$('signupMsg').textContent='Please enter your full name.';return}
  if(!ids.length){$('signupMsg').textContent='Choose at least one position.';return}
  $('signupMsg').textContent='Checking account details...';
  try{
    const {data:nameExists,error:nameCheckError}=await supabaseClient.rpc('signup_name_exists',{p_name:name});
    if(nameCheckError)throw new Error(`Unable to check the account name: ${nameCheckError.message}`);
    if(nameExists){$('signupMsg').textContent='An account with this name already exists. Please use a different name.';return}
    $('signupMsg').textContent='Creating account...';
    const {data,error}=await supabaseClient.auth.signUp({
      email,
      password:$('signupPassword').value,
      options:{data:{full_name:name,position_ids:ids}}
    });
    if(error){
      if(error.code==='23505'&&/signup_name_unique|profiles_name_unique/i.test(error.message)){
        $('signupMsg').textContent='An account with this name already exists. Please use a different name.';
      }else{
        $('signupMsg').textContent=error.message;
      }
      return;
    }
    if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
      $('signupMsg').textContent='An account with this email already exists. Please log in or use a different email.';
      return;
    }
    if(data.session){
      try{await bootstrapAccount();await boot(data.session)}catch(err){$('signupMsg').textContent=err.message}
    }else{
      $('signupMsg').textContent='Account created. Check your email if confirmation is enabled, then log in.';
    }
  }catch(error){
    $('signupMsg').textContent=error.message;
  }
};

$('logoutBtn').onclick=async()=>{await supabaseClient.auth.signOut()};
document.querySelectorAll('.nav').forEach(b=>{
  const label=b.querySelector('span')?.textContent.trim();
  if(label){b.setAttribute('aria-label',label);b.title=label}
  b.onclick=()=>switchView(b.dataset.view);
});
$('sidebarToggle').onclick=()=>{
  const collapsed=$('sidebarToggle').getAttribute('aria-expanded')==='true';
  $('sidebarToggle').setAttribute('aria-expanded',String(!collapsed));
  $('sidebarToggle').setAttribute('aria-label',collapsed?'Expand navigation':'Collapse navigation');
  $('sidebar').parentElement.classList.toggle('sidebar-collapsed',collapsed);
};
$('profileForm').onsubmit=async event=>{
  event.preventDefault();
  const name=$('profileName').value.trim(),email=$('profileEmail').value.trim();
  const selected=new Set([...document.querySelectorAll('#profilePositions input:checked')].map(input=>input.value));
  const originalProfile=currentProfile;
  if(!name){$('profileMsg').textContent='Please enter your name.';return}
  if(!$('profileEmail').checkValidity()){$('profileMsg').textContent='Enter a valid email address.';return}
  if(originalProfile.musician_id&&!selected.size){$('profileMsg').textContent='Choose at least one position.';return}
  $('profileMsg').textContent='Saving profile...';
  try{
    let pendingEmailConfirmation=false;
    if(email!==originalProfile.email){
      const {data,error}=await supabaseClient.auth.updateUser({email});
      if(error)throw new Error(`Email update failed: ${error.message}`);
      pendingEmailConfirmation=Boolean(data.user?.new_email);
    }
    const {error:profileError}=await supabaseClient.rpc('update_my_profile',{p_name:name});
    if(profileError)throw new Error(`Profile update failed: ${profileError.message}`);
    if(originalProfile.musician_id){
      const assigned=new Set((originalProfile.musicians?.musician_positions||[]).map(item=>item.position_id));
      const removed=[...assigned].filter(id=>!selected.has(id));
      const added=[...selected].filter(id=>!assigned.has(id));
      if(removed.length){
        const {error}=await supabaseClient.from('musician_positions').delete().eq('musician_id',originalProfile.musician_id).in('position_id',removed);
        if(error)throw new Error(`Name and email were saved, but removing positions failed: ${error.message}`);
      }
      if(added.length){
        const {error}=await supabaseClient.from('musician_positions').insert(added.map(position_id=>({musician_id:originalProfile.musician_id,position_id})));
        if(error)throw new Error(`Name and email were saved, but adding positions failed: ${error.message}`);
      }
    }
    currentProfile=await getProfile();
    $('userBadge').textContent=`${currentProfile.name} · ${currentProfile.role}`;
    $('welcomeTitle').textContent=`Hello, ${(currentProfile.name||'there').split(' ')[0]}`;
    renderMyPositions();
    renderProfile();
    $('profileMsg').textContent=pendingEmailConfirmation
      ?'Profile saved. Confirm the email change using the message sent to your new address; the new email will appear here after confirmation.'
      :'Profile saved.';
    if(pendingEmailConfirmation)$('profileEmail').value=email;
  }catch(error){
    $('profileMsg').textContent=error.message;
    try{currentProfile=await getProfile();renderProfile();renderMyPositions()}
    catch(refreshError){$('profileMsg').textContent+=` Could not refresh profile: ${refreshError.message}`}
  }
};
$('profilePasswordForm').onsubmit=async event=>{
  event.preventDefault();
  const currentPassword=$('profileCurrentPassword').value,newPassword=$('profileNewPassword').value;
  if(newPassword!==$('profileConfirmPassword').value){$('profilePasswordMsg').textContent='The new passwords do not match.';return}
  if(newPassword===currentPassword){$('profilePasswordMsg').textContent='Choose a new password different from your current password.';return}
  $('profilePasswordMsg').textContent='Verifying current password...';
  try{
    const {error:verifyError}=await supabaseClient.auth.signInWithPassword({email:currentProfile.email,password:currentPassword});
    if(verifyError)throw new Error(`Current password could not be verified: ${verifyError.message}`);
    $('profilePasswordMsg').textContent='Updating password...';
    const {error}=await supabaseClient.auth.updateUser({password:newPassword});
    if(error)throw new Error(`Password update failed: ${error.message}`);
    $('profilePasswordForm').reset();
    $('profilePasswordMsg').textContent='Password updated successfully.';
  }catch(error){$('profilePasswordMsg').textContent=error.message}
};
$('newScheduleBtn').onclick=()=>openScheduleBuilder();
$('saveAvailabilityBtn').onclick=saveAvailabilityChanges;
$('prevMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};
$('nextMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
$('prevAvailabilityMonth').onclick=()=>{availabilityCalendarDate=new Date(availabilityCalendarDate.getFullYear(),availabilityCalendarDate.getMonth()-1,1);renderAvailabilityCalendar()};
$('nextAvailabilityMonth').onclick=()=>{availabilityCalendarDate=new Date(availabilityCalendarDate.getFullYear(),availabilityCalendarDate.getMonth()+1,1);renderAvailabilityCalendar()};
$('userSearch').oninput=()=>renderUsers();$('roleFilter').onchange=()=>renderUsers();
document.querySelectorAll('.availability-marker').forEach(marker=>{
  marker.addEventListener('click',()=>selectAvailabilityStatus(marker.dataset.status));
  marker.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',marker.dataset.status);event.dataTransfer.effectAllowed='copy';selectAvailabilityStatus(marker.dataset.status)});
});

async function getPositions(){const {data,error}=await supabaseClient.from('positions').select('id,name,sort_order').order('sort_order');if(error)throw error;return data||[]}
async function getProfile(){const {data,error}=await supabaseClient.from('profiles').select('id,name,email,role,musician_id,status,musicians(id,name,active,musician_positions(position_id,positions(id,name)))').eq('id',session.user.id).single();if(error)throw error;return data}
async function getAllUsers(){const {data,error}=await supabaseClient.from('profiles').select('id,name,email,role,musician_id,status,musicians(id,name,active,musician_positions(position_id,positions(id,name)))').order('name');if(error)throw error;return data||[]}
async function getMusicians(){const {data,error}=await supabaseClient.from('musicians').select('id,name,active,musician_positions(position_id,positions(id,name))').order('name');if(error)throw error;return data||[]}
async function getSchedules(){const {data,error}=await supabaseClient.from('schedules').select('id,title,service_date').order('service_date');if(error)throw error;return data||[]}
async function getScheduleAvailability(date){const cached=scheduleAvailabilityCache.get(date);if(cached?.promise)return cached.promise;if(cached&&Date.now()-cached.cachedAt<30000)return cached.entries;const entry={entries:null,cachedAt:0,promise:null};entry.promise=(async()=>{const {data,error}=await supabaseClient.from('musician_availability').select('musician_id,status,musicians(name)').eq('service_date',date).order('status');if(error)throw error;const entries=data||[];if(scheduleAvailabilityCache.get(date)===entry){entry.entries=entries;entry.cachedAt=Date.now();entry.promise=null}return entries})().catch(error=>{if(scheduleAvailabilityCache.get(date)===entry)scheduleAvailabilityCache.delete(date);throw error});scheduleAvailabilityCache.set(date,entry);return entry.promise}
async function getScheduleConflicts(){const upcoming=schedules.filter(schedule=>schedule.service_date>=todayDateString());if(!upcoming.length)return{};const scheduleIds=upcoming.map(schedule=>schedule.id),dates=[...new Set(upcoming.map(schedule=>schedule.service_date))];const [{data:assignments,error:assignmentsError},{data:unavailable,error:availabilityError}]=await Promise.all([supabaseClient.from('schedule_assignments').select('schedule_id,musician_id').in('schedule_id',scheduleIds),supabaseClient.from('musician_availability').select('musician_id,service_date').eq('status','not_available').in('service_date',dates)]);if(assignmentsError)throw assignmentsError;if(availabilityError)throw availabilityError;const unavailableKeys=new Set((unavailable||[]).map(row=>`${row.service_date}:${row.musician_id}`)),scheduleDates=Object.fromEntries(upcoming.map(schedule=>[schedule.id,schedule.service_date])),conflicts={};(assignments||[]).forEach(assignment=>{const date=scheduleDates[assignment.schedule_id];if(unavailableKeys.has(`${date}:${assignment.musician_id}`))(conflicts[assignment.schedule_id]??=new Set()).add(assignment.musician_id)});return Object.fromEntries(Object.entries(conflicts).map(([id,musicianIds])=>[id,[...musicianIds]]))}
function getScheduleConflictNames(scheduleId){return(scheduleConflicts[scheduleId]||[]).map(id=>musicians.find(musician=>musician.id===id)?.name||'Musician')}
function scheduleConflictIndicator(schedule){const ids=scheduleConflicts[schedule.id]||[];if(!ids.length)return'';const message=currentProfile.role==='admin'?`${getScheduleConflictNames(schedule.id).join(', ')} marked unavailable for this service`:'You marked unavailable for this service';return`<span class="schedule-conflict-indicator" role="img" aria-label="${esc(message)}" title="${esc(message)}">!</span>`}
async function refreshScheduleConflicts(notifyAdmin=false){const request=++scheduleConflictRequest;try{const conflicts=await getScheduleConflicts();if(request!==scheduleConflictRequest)return;const previous=scheduleConflicts;scheduleConflicts=conflicts;scheduleConflictError='';if(notifyAdmin&&currentProfile?.role==='admin'){const newConflict=Object.entries(conflicts).find(([id,ids])=>ids.some(musicianId=>!(previous[id]||[]).includes(musicianId)));if(newConflict){const schedule=schedules.find(item=>item.id===newConflict[0]);if(schedule)toast(`Schedule conflict: ${schedule.title} on ${schedule.service_date}.`)}}}catch(error){if(request!==scheduleConflictRequest)return;console.error('Unable to verify schedule availability conflicts:',error);scheduleConflictError=error?.message||'An unexpected error occurred.'}renderDashboard();renderCalendar()}

async function boot(s){
  if(!s)return;
  session=s;
  await bootstrapAccount();
  const profile=await getProfile();
  if(profile.status!=='active'){
    await supabaseClient.auth.signOut();
    throw new Error('Your account is inactive. Please contact an administrator.');
  }
  const [loadedMusicians,loadedSchedules,loadedUsers]=await Promise.all([
    getMusicians(),
    getSchedules(),
    profile.role==='admin'?getAllUsers():Promise.resolve([])
  ]);
  currentProfile=profile;
  musicians=loadedMusicians;
  schedules=loadedSchedules;
  users=loadedUsers;
  myLineupCache=null;
  await refreshScheduleConflicts();
  $('authScreen').classList.add('hidden');$('app').classList.remove('hidden');
  $('userBadge').textContent=`${currentProfile.name} · ${currentProfile.role}`;
  document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',currentProfile.role!=='admin'));
  $('profileNav').classList.remove('hidden');
  $('availabilityNav').classList.toggle('hidden',!currentProfile.musician_id);
  $('welcomeTitle').textContent=`Hello, ${(currentProfile.name||'there').split(' ')[0]}`;
  renderSignupPositions();renderDashboard();renderMyPositions();
  if(currentProfile.role==='admin'){renderUsers();renderMusicians()}
  subscribeRealtime();
}

function renderSignupPositions(){if(!$('signupPositions'))return;$('signupPositions').innerHTML=positions.map(p=>`<label class="checkbox-option"><input type="checkbox" value="${p.id}"><span>${esc(p.name)}</span></label>`).join('')}
async function renderProfile(){
  if(!currentProfile)return;
  if(session?.user?.email&&session.user.email!==currentProfile.email){
    try{
      const {error}=await supabaseClient.rpc('update_my_profile',{p_name:currentProfile.name});
      if(error)throw error;
      currentProfile=await getProfile();
      renderMyPositions();
    }catch(error){$('profileMsg').textContent=`Unable to sync your confirmed email: ${error.message}`}
  }
  $('profileName').value=currentProfile.name||'';
  $('profileEmail').value=currentProfile.email||'';
  const assigned=new Set((currentProfile.musicians?.musician_positions||[]).map(item=>item.position_id));
  $('profilePositions').innerHTML=currentProfile.musician_id
    ?positions.map(position=>`<label class="checkbox-option"><input type="checkbox" value="${position.id}" ${assigned.has(position.id)?'checked':''}><span>${esc(position.name)}</span></label>`).join('')
    :'<p class="muted">No musician profile is linked to this account. Ask an administrator to link one before changing positions.</p>';
  $('profilePositions').querySelectorAll('input').forEach(input=>input.disabled=!currentProfile.musician_id);
}
function switchView(view){if(view!=='availability'&&Object.keys(availabilityPendingChanges).length){showDiscardConfirmation(()=>{discardUnsavedChanges();switchView(view)});return}document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$(view+'View').classList.remove('hidden');document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));if(view==='calendar')renderCalendar();if(view==='lineup')renderMyLineup();if(view==='availability')renderAvailabilityCalendar();if(view==='profile')renderProfile();if(view==='users')renderUsers();if(view==='musicians')renderMusicians()}
function todayDateString(){const today=new Date();return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`}
function isPastServiceDate(value){return Boolean(value&&value<todayDateString())}
function renderDashboard(){const today=todayDateString(),month=today.slice(0,7),upcoming=schedules.filter(s=>s.service_date>=today),conflicted=upcoming.filter(s=>(scheduleConflicts[s.id]||[]).length),notice=$('scheduleConflictNotice');$('statUpcoming').textContent=upcoming.length;$('statUsers').textContent=currentProfile.role==='admin'?users.length:(musicians.length||0);$('statMonth').textContent=upcoming.filter(s=>s.service_date.startsWith(month)).length;notice.classList.toggle('hidden',!scheduleConflictError&&!conflicted.length);if(scheduleConflictError){notice.innerHTML=`<strong>Unable to verify schedule availability.</strong><p>${esc(scheduleConflictError)}</p>`}else if(conflicted.length){notice.innerHTML=`<strong>Schedule conflict${conflicted.length===1?'':'s'} detected</strong><p>${currentProfile.role==='admin'?'The following musicians are assigned to services they marked unavailable:':'You are assigned to a service you marked unavailable:'}</p><ul>${conflicted.map(s=>`<li><strong>${esc(s.title)}</strong>${scheduleConflictIndicator(s)} (${esc(s.service_date)}): ${esc(getScheduleConflictNames(s.id).join(', '))}</li>`).join('')}</ul>`}else notice.innerHTML='';$('nextServices').innerHTML=upcoming.slice(0,5).map(s=>`<div class="list-row"><div><strong>${esc(s.title)}</strong>${scheduleConflictIndicator(s)}<small>${esc(s.service_date)}</small></div><div class="row-actions"><button class="btn btn-secondary" onclick="viewSchedule('${s.id}')">View</button>${currentProfile.role==='admin'?`<button class="btn btn-secondary" onclick="editSchedule('${s.id}')">Edit</button><button class="btn btn-danger" onclick="deleteSchedule('${s.id}')">Delete</button>`:''}</div></div>`).join('')||'<p class="muted">No upcoming schedules.</p>'}
function renderMyPositions(){const ps=currentProfile.musicians?.musician_positions||[];$('myPositions').innerHTML=ps.map(x=>`<span class="pill">${esc(x.positions.name)}</span>`).join('')||'<p class="muted">No positions assigned.</p>'}

function isServiceDateAllowed(value){if(!value)return false;const [year,month,day]=value.split('-').map(Number);return [0,4].includes(new Date(year,month-1,day).getDay())}
function showPastServiceDateError(){openModal(`<div class="confirm"><div class="danger-icon">!</div><h3>Past date not allowed</h3><p>You can't schedule a service for a date that has already passed. Choose today or a future date.</p><div class="form-actions"><button class="btn btn-primary" onclick="closeModal()">Close</button></div></div>`)}
function validateServiceDate(input){if(isPastServiceDate(input.value)){input.setCustomValidity('Services cannot be scheduled on a past date.');showPastServiceDateError();return false}if(!input.value||isServiceDateAllowed(input.value)){input.setCustomValidity('');return true}input.setCustomValidity('Services can only be scheduled on Sundays or Thursdays.');toast('Services can only be scheduled on Sundays or Thursdays.');return false}
function nextServiceDate(){const date=new Date();while(!isServiceDateAllowed(todayDateStringFor(date)))date.setDate(date.getDate()+1);return todayDateStringFor(date)}
function todayDateStringFor(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function availabilityErrorMessage(error){const message=error?.message||'';if(error?.code==='42703'||error?.code==='PGRST204'||(message.includes('musician_availability')&&message.includes('status')))return 'Availability needs a database update. In Supabase SQL Editor, run supabase/migration_availability_status.sql, then reload this page.';return message||'Unable to load availability.'}

function selectAvailabilityStatus(status){availabilitySelectedStatus=availabilitySelectedStatus===status?null:status;document.querySelectorAll('.availability-marker').forEach(marker=>{const selected=marker.dataset.status===availabilitySelectedStatus;marker.classList.toggle('selected',selected);marker.setAttribute('aria-pressed',String(selected))})}
function updateAvailabilitySaveButton(){const count=Object.keys(availabilityPendingChanges).length,button=$('saveAvailabilityBtn');button.disabled=count===0||button.dataset.saving==='true';$('availabilityHelp').textContent=count?`${count} unsaved change${count===1?'':'s'}. Save your changes when you're done.`:'Drag a marker onto a future Sunday or Thursday. On touch devices, tap a marker, then tap a date.'}
function discardUnsavedChanges(){availabilityPendingChanges={};modalEditSnapshot=null;updateAvailabilitySaveButton();dismissModal();renderAvailabilityCalendar()}
async function renderAvailabilityCalendar(){
  if(!currentProfile?.musician_id)return;
  const token=++availabilityRenderToken,y=availabilityCalendarDate.getFullYear(),m=availabilityCalendarDate.getMonth();
  const monthStart=`${y}-${String(m+1).padStart(2,'0')}-01`,monthEnd=todayDateStringFor(new Date(y,m+1,1));
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
  $('availabilityCalendarTitle').textContent=availabilityCalendarDate.toLocaleString(undefined,{month:'long',year:'numeric'});
  $('availabilityCalendar').innerHTML='<p class="muted">Loading your availability...</p>';
  const {data,error}=await supabaseClient.from('musician_availability').select('service_date,status').eq('musician_id',currentProfile.musician_id).gte('service_date',monthStart).lt('service_date',monthEnd);
  if(token!==availabilityRenderToken)return;
  if(error){$('availabilityCalendar').innerHTML=`<p class="muted">${esc(availabilityErrorMessage(error))}</p>`;return}
  for(let day=1;day<=days;day++)delete availabilitySavedStatuses[`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`];
  (data||[]).forEach(item=>availabilitySavedStatuses[item.service_date]=item.status);
  let html='';
  for(const day of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])html+=`<div class="availability-weekday">${day}</div>`;
  for(let i=0;i<first;i++)html+='<div class="availability-day outside" aria-hidden="true"></div>';
  for(let d=1;d<=days;d++){
    const date=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const serviceDay=isServiceDateAllowed(date),past=isPastServiceDate(date),status=Object.prototype.hasOwnProperty.call(availabilityPendingChanges,date)?availabilityPendingChanges[date]:availabilitySavedStatuses[date]||(serviceDay&&!past?'available':'');
    const stateClass=status==='available'?'is-available':status==='not_available'?'is-unavailable':'';
    const disabledClass=past||!serviceDay?'disabled':'';
    const accessibleStatus=status==='available'?'available':status==='not_available'?'not available':'not marked';
    const cellAttributes=serviceDay&&!past?`tabindex="0" role="button" aria-label="${date}, ${accessibleStatus}"`:'';
    const marker=status==='available'?'✓':status==='not_available'?'×':past?'':'+';
    html+=`<div class="availability-day ${serviceDay?'service-day':''} ${disabledClass} ${stateClass}" data-date="${date}" ${cellAttributes}><span class="availability-day-number">${d}</span>${serviceDay?`<span class="availability-day-status">${marker}</span>`:''}</div>`;
  }
  const padding=(7-(first+days)%7)%7;
  for(let i=0;i<padding;i++)html+='<div class="availability-day outside" aria-hidden="true"></div>';
  $('availabilityCalendar').innerHTML=html;
  document.querySelectorAll('#availabilityCalendar .availability-day[role="button"]').forEach(cell=>{
    cell.addEventListener('click',()=>{if(availabilitySelectedStatus)setAvailabilityStatus(cell.dataset.date,availabilitySelectedStatus)});
    cell.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&availabilitySelectedStatus){event.preventDefault();setAvailabilityStatus(cell.dataset.date,availabilitySelectedStatus)}});
    cell.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';cell.classList.add('drag-over')});
    cell.addEventListener('dragleave',()=>cell.classList.remove('drag-over'));
    cell.addEventListener('drop',event=>{event.preventDefault();cell.classList.remove('drag-over');const status=event.dataTransfer.getData('text/plain');if(['available','not_available'].includes(status))setAvailabilityStatus(cell.dataset.date,status)});
  });
}
async function setAvailabilityStatus(date,status){if(!currentProfile?.musician_id||isPastServiceDate(date)||!isServiceDateAllowed(date)||!['available','not_available'].includes(status))return toast('Choose an upcoming Sunday or Thursday.');availabilityPendingChanges[date]=status===availabilitySavedStatuses[date]?undefined:status;if(availabilityPendingChanges[date]===undefined)delete availabilityPendingChanges[date];if(Object.keys(availabilityPendingChanges).length)armHistoryGuard();else releaseModalHistoryGuard();updateAvailabilitySaveButton();await renderAvailabilityCalendar()}
async function saveAvailabilityChanges(){const changes=Object.entries(availabilityPendingChanges);if(!changes.length)return;const button=$('saveAvailabilityBtn');button.dataset.saving='true';button.disabled=true;button.textContent='Saving...';const rows=changes.map(([service_date,status])=>({musician_id:currentProfile.musician_id,service_date,status}));const {error}=await supabaseClient.from('musician_availability').upsert(rows,{onConflict:'musician_id,service_date'});button.dataset.saving='false';button.textContent='Save Changes';if(error){updateAvailabilitySaveButton();return toast(availabilityErrorMessage(error))}for(const [date] of changes)scheduleAvailabilityCache.delete(date);Object.assign(availabilitySavedStatuses,Object.fromEntries(changes));availabilityPendingChanges={};releaseModalHistoryGuard();updateAvailabilitySaveButton();await renderAvailabilityCalendar();toast('Availability changes saved.');await refreshScheduleConflicts(true)}
async function renderScheduleAvailability(date,targetId){const target=$(targetId),request=++schedulePreviewRequest;if(!date||!isServiceDateAllowed(date)){target.innerHTML='<p class="muted">Choose a Sunday or Thursday to view team availability.</p>';return}target.innerHTML='<p class="muted">Loading availability...</p>';let entries;try{entries=await getScheduleAvailability(date)}catch(error){if(request===schedulePreviewRequest)target.innerHTML=`<p class="muted">${esc(availabilityErrorMessage(error))}</p>`;return}if(request!==schedulePreviewRequest)return;const statuses=Object.fromEntries(entries.map(item=>[item.musician_id,item.status])),available=musicians.filter(m=>m.active&&statuses[m.id]!=='not_available').map(m=>({musicians:{name:m.name}})),unavailable=entries.filter(item=>item.status==='not_available'),renderGroup=(label,status,items,empty)=>`<div class="availability-group ${status}"><strong>${label}</strong>${items.length?`<div class="availability-pills">${items.map(item=>`<span class="pill">${esc(item.musicians?.name||'Musician')}</span>`).join('')}</div>`:`<p class="muted">${empty}</p>`}</div>`;target.innerHTML=renderGroup('Available','available',available,'No available musicians.')+renderGroup('Not available','unavailable',unavailable,'No one marked unavailable.')}
async function getUnavailableMusicianIds(date){try{return new Set((await getScheduleAvailability(date)).filter(row=>row.status==='not_available').map(row=>row.musician_id))}catch(error){toast(availabilityErrorMessage(error));return null}}
async function notifyScheduledMusicians(scheduleId,musicianIds){const recipients=[...new Set(musicianIds.filter(Boolean))];if(!recipients.length)return'No musician assignment emails were needed.';const {data,error}=await supabaseClient.functions.invoke('schedule-email',{body:{type:'assignment',schedule_id:scheduleId,musician_ids:recipients}});if(error){console.error('Unable to send schedule assignment emails:',error);return`Assignment email delivery failed: ${error.message}`}if(data?.failures?.length){console.error('Some schedule assignment emails were not sent:',data.failures);const details=data.failures.slice(0,2).map(failure=>`${failure.musician}: ${failure.error}`).join('; '),more=data.failures.length>2?`; ${data.failures.length-2} more failed`:'';return`${data.message||'Some assignment emails could not be sent.'} ${details}${more}`}return data?.message||'Assignment emails sent.'}
async function validateLineup(prefix,date){const selects=[...document.querySelectorAll(`.${prefix}-select`)],selected=selects.filter(select=>select.value);if(positions.length===0||selects.length!==positions.length||selected.length!==positions.length)return toast('Assign a musician to every position before saving.'),false;if(!checkBuilderDuplicates(prefix))return toast('A musician cannot be assigned to two positions in the same schedule.'),false;const unavailable=await getUnavailableMusicianIds(date);if(!unavailable)return false;if(selected.some(select=>unavailable.has(select.value)))return toast('A selected musician is marked not available for this service date. Choose someone else.'),false;return true}
async function handleScheduleDateChange(input,targetId,prefix){if(!validateServiceDate(input)){$(targetId).innerHTML='';return}const date=input.value;renderScheduleAvailability(date,targetId);const unavailable=await getUnavailableMusicianIds(date);if(input.value!==date)return;if(!unavailable){$(`${prefix}Assignments`).innerHTML='<p class="muted">Could not verify musician availability. Change the service date or try again.</p>';return}if(prefix==='ns')renderBuilderRows(unavailable);else if(prefix==='es')renderEditRows(editingScheduleAssignments,unavailable)}

async function viewSchedule(id){const s=schedules.find(x=>x.id===id);if(!s)return;const {data,error}=await supabaseClient.from('schedule_assignments').select('position_id,musician_id,positions(name),musicians(name)').eq('schedule_id',id).order('position_id');if(error)return toast(error.message);openModal(`<div class="modal-head"><div><p class="eyebrow">LINEUP</p><h3>${esc(s.title)}</h3><p class="muted">${esc(s.service_date)}</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="lineup-grid">${(data||[]).map(a=>`<div class="lineup-card"><span>${esc(a.positions.name)}</span><strong>${esc(a.musicians.name)}</strong></div>`).join('')||'<p class="muted">No assignments yet.</p>'}</div>`)}

function renderCalendar(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=todayDateString();$('calendarTitle').textContent=calendarDate.toLocaleString(undefined,{month:'long',year:'numeric'});let h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="cal-label">${x}</div>`).join('');for(let i=0;i<first;i++)h+='<div class="cal-cell empty"></div>';for(let d=1;d<=days;d++){const date=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,ss=date>=today?schedules.filter(s=>s.service_date===date):[];h+=`<div class="cal-cell"><b>${d}</b>${ss.map(s=>`<button class="event" onclick="viewSchedule('${s.id}')">${esc(s.title)}${scheduleConflictIndicator(s)}</button>`).join('')}</div>`}$('calendar').innerHTML=h}

async function renderMyLineup(){const request=++myLineupRenderRequest,myId=currentProfile.musician_id;if(!myId){$('myLineup').innerHTML='<p class="muted">No musician profile linked.</p>';return}let entry=myLineupCache,data;if(entry?.musicianId===myId&&(entry.promise||Date.now()-entry.cachedAt<30000)){try{data=entry.promise?await entry.promise:entry.data}catch(error){if(request===myLineupRenderRequest)$('myLineup').innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}}else{entry={musicianId:myId,data:null,cachedAt:0,promise:null};entry.promise=supabaseClient.from('schedule_assignments').select('schedule_id,position_id,positions(name),schedules(id,title,service_date)').eq('musician_id',myId).then(({data,error})=>{if(error)throw error;return data||[]});myLineupCache=entry;try{data=await entry.promise;entry.data=data;entry.cachedAt=Date.now();entry.promise=null}catch(error){if(myLineupCache===entry)myLineupCache=null;if(request===myLineupRenderRequest)$('myLineup').innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}}if(request!==myLineupRenderRequest)return;const map={};data.forEach(x=>(map[x.schedule_id]??=[]).push(x));const items=Object.values(map).filter(a=>a[0].schedules.service_date>=todayDateString()).sort((a,b)=>a[0].schedules.service_date.localeCompare(b[0].schedules.service_date));$('myLineup').innerHTML=items.map(a=>`<div class="glass-card schedule-item"><div><h3>${esc(a[0].schedules.title)}</h3><p>${esc(a[0].schedules.service_date)}</p></div><div>${a.map(x=>`<span class="pill">${esc(x.positions.name)}</span>`).join('')}</div></div>`).join('')||'<p class="muted">You have no upcoming assignments.</p>'}

async function openScheduleBuilder(){const today=nextServiceDate(),minimum=todayDateString();openModal(`<div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>New Worship Schedule</h3></div><button class="close-btn" onclick="closeModal()">×</button></div><label>Schedule title</label><input id="nsTitle" class="input" placeholder="1st Week of October"><label>Service date</label><input id="nsDate" type="date" class="input" value="${today}" min="${minimum}" onchange="handleScheduleDateChange(this,'nsAvailability','ns')" required><small class="muted">Services are available on Sundays and Thursdays only.</small><div class="availability-preview"><strong>Available musicians</strong><div id="nsAvailability"></div></div><label>Lineup</label><div id="nsAssignments"><p class="muted">Loading musician availability...</p></div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewSchedule()">Create & Save</button></div>`);renderScheduleAvailability(today,'nsAvailability');const unavailable=await getUnavailableMusicianIds(today);if(unavailable)renderBuilderRows(unavailable);armModalUnsavedChangesGuard()}
function renderBuilderRows(unavailable=new Set()){
  const selected=Object.fromEntries([...document.querySelectorAll('.ns-select')].map(select=>[select.dataset.position,select.value]));
  $('nsAssignments').innerHTML=positions.map(p=>`<div class="assignment-row"><label>${esc(p.name)}</label><select class="input ns-select" data-position="${p.id}"><option value="">-- Select Musician --</option>${musicians.filter(m=>m.active&&m.musician_positions.some(x=>x.position_id===p.id)).map(m=>`<option value="${m.id}" ${selected[p.id]===m.id?'selected':''} ${unavailable.has(m.id)?'disabled':''}>${esc(m.name)}${unavailable.has(m.id)?' (Not available)':''}</option>`).join('')}</select></div>`).join('');
  document.querySelectorAll('.ns-select').forEach(sel=>sel.addEventListener('change',checkBuilderDuplicates));
}
function renderEditRows(assignments, unavailable=new Set()){
  const assignedByPosition=Object.fromEntries((assignments||[]).map(a=>[a.position_id,a.musician_id])),selected=Object.fromEntries([...document.querySelectorAll('.es-select')].map(select=>[select.dataset.position,select.value]));
  $('esAssignments').innerHTML=positions.map(p=>{const assignedId=selected[p.id]||assignedByPosition[p.id]||'';return `<div class="assignment-row"><label>${esc(p.name)}</label><select class="input es-select" data-position="${p.id}"><option value="">-- Select Musician --</option>${musicians.filter(m=>(m.active||m.id===assignedId)&&m.musician_positions.some(x=>x.position_id===p.id)).map(m=>`<option value="${m.id}" ${m.id===assignedId?'selected':''} ${unavailable.has(m.id)?'disabled':''}>${esc(m.name)}${unavailable.has(m.id)?' (Not available)':''}</option>`).join('')}</select></div>`}).join('');
  document.querySelectorAll('.es-select').forEach(sel=>sel.addEventListener('change',()=>checkBuilderDuplicates('es')));
}
function checkBuilderDuplicates(prefix='ns'){const used={},duplicates=new Set();document.querySelectorAll(`.${prefix}-select`).forEach(s=>{if(s.value){if(used[s.value])duplicates.add(s.value);used[s.value]=s.dataset.position}});document.querySelectorAll(`.${prefix}-select`).forEach(s=>s.classList.toggle('conflict',duplicates.has(s.value)));return duplicates.size===0}
async function saveNewSchedule(){const title=$('nsTitle').value.trim(),date=$('nsDate').value;if(!title||!date)return toast('Schedule title and date are required.');if(isPastServiceDate(date))return showPastServiceDateError();if(!isServiceDateAllowed(date))return toast('Services can only be scheduled on Sundays or Thursdays.');if(!await validateLineup('ns',date))return;const {data:s,error}=await supabaseClient.from('schedules').insert({title,service_date:date}).select().single();if(error)return toast(error.message);const rows=[...document.querySelectorAll('.ns-select')].map(x=>({schedule_id:s.id,position_id:x.dataset.position,musician_id:x.value}));const {error:e}=await supabaseClient.from('schedule_assignments').insert(rows);if(e){const {error:rollbackError}=await supabaseClient.from('schedules').delete().eq('id',s.id);return toast(rollbackError?`${e.message} Schedule cleanup failed: ${rollbackError.message}`:e.message)}dismissModal();myLineupCache=null;schedules=await getSchedules();renderDashboard();renderCalendar();const emailResult=await notifyScheduledMusicians(s.id,rows.map(row=>row.musician_id));toast(`Schedule created. ${emailResult}`)}
async function editSchedule(id){if(currentProfile.role!=='admin')return;const s=schedules.find(x=>x.id===id);if(!s)return;const {data,error}=await supabaseClient.from('schedule_assignments').select('position_id,musician_id').eq('schedule_id',id);if(error)return toast(error.message);editingScheduleAssignments=data||[];openModal(`<div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>Edit Worship Schedule</h3></div><button class="close-btn" onclick="closeModal()">×</button></div><label>Schedule title</label><input id="esTitle" class="input" value="${esc(s.title)}"><label>Service date</label><input id="esDate" type="date" class="input" value="${esc(s.service_date)}" min="${todayDateString()}" onchange="handleScheduleDateChange(this,'esAvailability','es')" required><small class="muted">Services are available on Sundays and Thursdays only.</small><div class="availability-preview"><strong>Available musicians</strong><div id="esAvailability"></div></div><label>Lineup</label><div id="esAssignments"><p class="muted">Loading musician availability...</p></div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveEditedSchedule('${id}')">Save Changes</button></div>`);renderScheduleAvailability(s.service_date,'esAvailability');const unavailable=await getUnavailableMusicianIds(s.service_date);if(unavailable)renderEditRows(editingScheduleAssignments,unavailable);armModalUnsavedChangesGuard()}
async function saveEditedSchedule(id){if(currentProfile?.role!=='admin')return toast('Only administrators can edit services.');const title=$('esTitle').value.trim(),date=$('esDate').value,previousSchedule=schedules.find(schedule=>schedule.id===id);if(!title||!date)return toast('Schedule title and date are required.');if(isPastServiceDate(date))return showPastServiceDateError();if(!isServiceDateAllowed(date))return toast('Services can only be scheduled on Sundays or Thursdays.');if(!await validateLineup('es',date))return;const {error}=await supabaseClient.from('schedules').update({title,service_date:date}).eq('id',id);if(error)return toast(error.message);const {error:deleteError}=await supabaseClient.from('schedule_assignments').delete().eq('schedule_id',id);if(deleteError)return toast(deleteError.message);const rows=[...document.querySelectorAll('.es-select')].map(x=>({schedule_id:id,position_id:x.dataset.position,musician_id:x.value}));const {error:insertError}=await supabaseClient.from('schedule_assignments').insert(rows);if(insertError)return toast(insertError.message);const previousMusicians=new Set(editingScheduleAssignments.map(assignment=>assignment.musician_id)),emailRecipients=previousSchedule?.service_date!==date?rows.map(row=>row.musician_id):rows.filter(row=>!previousMusicians.has(row.musician_id)).map(row=>row.musician_id);dismissModal();myLineupCache=null;schedules=await getSchedules();renderDashboard();renderCalendar();renderMyLineup();const emailResult=await notifyScheduledMusicians(id,emailRecipients);toast(`Schedule updated. ${emailResult}`)}
async function deleteSchedule(id){if(currentProfile?.role!=='admin')return toast('Only administrators can delete schedules.');const schedule=schedules.find(item=>item.id===id);if(!schedule)return;openModal(`<div class="confirm"><div class="danger-icon">!</div><h3>Delete schedule?</h3><p>Delete <strong>${esc(schedule.title)}</strong> on <strong>${esc(schedule.service_date)}</strong>? Its lineup assignments will also be removed.</p><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmDeleteSchedule('${id}')">Delete Schedule</button></div></div>`)}
async function confirmDeleteSchedule(id){if(currentProfile?.role!=='admin')return toast('Only administrators can delete schedules.');const {data:assignments,error:readError}=await supabaseClient.from('schedule_assignments').select('position_id,musician_id').eq('schedule_id',id);if(readError)return toast(readError.message);const {error:assignmentError}=await supabaseClient.from('schedule_assignments').delete().eq('schedule_id',id);if(assignmentError)return toast(assignmentError.message);const {error:scheduleError}=await supabaseClient.from('schedules').delete().eq('id',id);if(scheduleError){if(assignments?.length){const {error:restoreError}=await supabaseClient.from('schedule_assignments').insert(assignments.map(row=>({...row,schedule_id:id})));if(restoreError)return toast(`Schedule deletion failed: ${scheduleError.message}. Restoring lineup assignments also failed: ${restoreError.message}`)}return toast(scheduleError.message)}dismissModal();myLineupCache=null;schedules=await getSchedules();renderDashboard();renderCalendar();await renderMyLineup();toast('Schedule and lineup deleted.')}

async function renderUsers(){if(currentProfile.role!=='admin')return;const q=($('userSearch').value||'').toLowerCase(),r=$('roleFilter').value;const rows=users.filter(u=>(!q||u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))&&(!r||u.role===r));$('usersTable').innerHTML=`<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Positions</th><th>Actions</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="pill">${esc(u.role)}</span></td><td><span class="pill">${esc(u.status)}</span></td><td>${(u.musicians?.musician_positions||[]).map(x=>esc(x.positions.name)).join(', ')||'—'}</td><td><button class="btn btn-secondary" onclick="editUser('${u.id}')">Edit</button></td></tr>`).join('')}</tbody></table>`;$('statUsers').textContent=users.length}
async function editUser(id){const u=users.find(x=>x.id===id);if(!u)return;openModal(`<div class="modal-head"><h3>Edit User</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="euName" class="input" value="${esc(u.name)}"><label>Email</label><input class="input" value="${esc(u.email)}" disabled><label>Role</label><select id="euRole" class="input"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select><label>Status</label><select id="euStatus" class="input"><option value="active" ${u.status==='active'?'selected':''}>Active</option><option value="inactive" ${u.status==='inactive'?'selected':''}>Inactive</option></select><label>Dedicated positions</label><div id="euPos" class="checkbox-grid compact">${positions.map(p=>{const yes=(u.musicians?.musician_positions||[]).some(x=>x.position_id===p.id);return `<label class="checkbox-option"><input type="checkbox" value="${p.id}" ${yes?'checked':''}><span>${esc(p.name)}</span></label>`}).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveUser('${id}')">Save</button></div>`);armModalUnsavedChangesGuard()}
async function saveUser(id){const u=users.find(x=>x.id===id),name=$('euName').value.trim(),role=$('euRole').value,status=$('euStatus').value,ids=[...document.querySelectorAll('#euPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and at least one position are required.');const {error}=await supabaseClient.from('profiles').update({name,role,status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message);if(u.musician_id){const {error:e1}=await supabaseClient.from('musicians').update({name,active:status==='active'}).eq('id',u.musician_id);if(e1)return toast(e1.message);const {error:e2}=await supabaseClient.from('musician_positions').delete().eq('musician_id',u.musician_id);if(e2)return toast(e2.message);const {error:e3}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:u.musician_id,position_id})));if(e3)return toast(e3.message)}dismissModal();await boot(session);switchView('users');toast('User updated.')}

function renderMusicians(){if(currentProfile.role!=='admin')return;$('musicianList').innerHTML=musicians.map(m=>`<div class="list-row"><div><strong>${esc(m.name)}</strong><small>${(m.musician_positions||[]).map(x=>esc(x.positions.name)).join(', ')||'No positions'} ${m.active?'':'· Archived'}</small></div><div class="row-actions"><button class="btn btn-secondary" onclick="editMusician('${m.id}')">Edit</button><button class="btn btn-danger" onclick="deleteMusician('${m.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No musicians.</p>'}
async function editMusician(id){const m=musicians.find(x=>x.id===id);if(!m)return;openModal(`<div class="modal-head"><h3>Edit Musician</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="emName" class="input" value="${esc(m.name)}"><label>Dedicated positions</label><div id="emPos" class="checkbox-grid compact">${positions.map(p=>{const yes=(m.musician_positions||[]).some(x=>x.position_id===p.id);return `<label class="checkbox-option"><input type="checkbox" value="${p.id}" ${yes?'checked':''}><span>${esc(p.name)}</span></label>`}).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveMusician('${id}')">Save</button></div>`);armModalUnsavedChangesGuard()}
async function saveMusician(id){const m=musicians.find(x=>x.id===id),name=$('emName').value.trim(),ids=[...document.querySelectorAll('#emPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and at least one position are required.');const {error}=await supabaseClient.from('musicians').update({name}).eq('id',id);if(error)return toast(error.message);const {error:e1}=await supabaseClient.from('musician_positions').delete().eq('musician_id',id);if(e1)return toast(e1.message);const {error:e2}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:id,position_id})));if(e2)return toast(e2.message);dismissModal();musicians=await getMusicians();renderMusicians();if(currentProfile.musician_id===id){currentProfile=await getProfile();renderMyPositions()}toast('Musician updated.')}
async function deleteMusician(id){if(currentProfile?.role!=='admin')return toast('Only administrators can delete musicians.');const m=musicians.find(x=>x.id===id);if(!m)return;openModal(`<div class="confirm"><div class="danger-icon">!</div><h3>Delete musician?</h3><p>Permanently delete <strong>${esc(m.name)}</strong>${m.active?'':' (archived)'} and any linked login account? This cannot be undone. Existing schedules will remain, but this musician's lineup assignments will be removed.</p><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmDeleteMusician('${id}')">Delete Musician</button></div></div>`)}
async function confirmDeleteMusician(id){if(currentProfile?.role!=='admin')return toast('Only administrators can delete musicians.');const {data,error}=await supabaseClient.functions.invoke('delete-musician',{body:{musician_id:id}});if(error){const body=error.context instanceof Response?await error.context.json():null;return toast(body?.message||error.message)}dismissModal();musicians=await getMusicians();users=await getAllUsers();renderMusicians();renderUsers();toast(data?.message||'Musician and linked account deleted.')}
$('addMusicianBtn').onclick=()=>{openModal(`<div class="modal-head"><h3>Add Musician</h3><button class="close-btn" onclick="closeModal()">×</button></div><label>Name</label><input id="amName" class="input"><label>Positions</label><div id="amPos" class="checkbox-grid compact">${positions.map(p=>`<label class="checkbox-option"><input type="checkbox" value="${p.id}"><span>${esc(p.name)}</span></label>`).join('')}</div><div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewMusician()">Save</button></div>`);armModalUnsavedChangesGuard()};
async function saveNewMusician(){const name=$('amName').value.trim(),ids=[...document.querySelectorAll('#amPos input:checked')].map(x=>x.value);if(!name||!ids.length)return toast('Name and position are required.');const {data,error}=await supabaseClient.from('musicians').insert({name}).select().single();if(error)return toast(error.message);const {error:e}=await supabaseClient.from('musician_positions').insert(ids.map(position_id=>({musician_id:data.id,position_id})));if(e){await supabaseClient.from('musicians').delete().eq('id',data.id);return toast(e.message)}dismissModal();musicians=await getMusicians();renderMusicians();toast('Musician added.')}

function subscribeRealtime(){if(realtimeChannel)return;realtimeChannel=supabaseClient.channel('worshipflow-v4-live').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},async()=>{schedules=await getSchedules();myLineupCache=null;await refreshScheduleConflicts(true);renderMyLineup()}).on('postgres_changes',{event:'*',schema:'public',table:'schedule_assignments'},async()=>{myLineupCache=null;await refreshScheduleConflicts(true);renderMyLineup()}).on('postgres_changes',{event:'*',schema:'public',table:'musician_availability'},async(payload)=>{if(payload.new?.service_date)scheduleAvailabilityCache.delete(payload.new.service_date);if(payload.old?.service_date)scheduleAvailabilityCache.delete(payload.old.service_date);await refreshScheduleConflicts(true)}).on('postgres_changes',{event:'*',schema:'public',table:'musicians'},async()=>{musicians=await getMusicians();if(currentProfile?.role==='admin')renderMusicians();renderMyPositions();renderDashboard();renderCalendar()}).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},async()=>{if(session){try{const previousRole=currentProfile.role;currentProfile=await getProfile();if(previousRole!==currentProfile.role){scheduleAvailabilityCache.clear();await refreshScheduleConflicts()}if(currentProfile.role==='admin'){users=await getAllUsers();renderUsers()}renderDashboard();renderCalendar();renderMyPositions();document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',currentProfile.role!=='admin'))}catch(e){console.warn(e)}}}).subscribe()}

supabaseClient.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_OUT'){session=null;currentProfile=null;users=[];scheduleConflicts={};scheduleConflictError='';scheduleAvailabilityCache.clear();myLineupCache=null;if(realtimeChannel){await supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null}showWelcome();return}if(event==='PASSWORD_RECOVERY'){showAuth('recovery');return}if(event==='USER_UPDATED'&&!$('recoveryForm').classList.contains('hidden'))return;if(s&&event!=='INITIAL_SESSION'){try{await boot(s)}catch(e){console.error(e);toast(e.message)}}});

(async()=>{try{positions=await getPositions()}catch(e){console.error(e);positions=[]}renderSignupPositions();const {data}=await supabaseClient.auth.getSession();if(data.session){const recoveryRequested=new URLSearchParams(window.location.hash.slice(1)).get('type')==='recovery';if(recoveryRequested){showAuth('recovery');return}try{await boot(data.session)}catch(e){console.error(e);showAuth('login');toast(e.message)}}else showWelcome()})();
