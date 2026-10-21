const resetHashParams=new URLSearchParams(window.location.hash.slice(1));
const resetQueryParams=new URLSearchParams(window.location.search);
const hasAuthCallback=resetQueryParams.has('code')||resetHashParams.has('access_token')||resetQueryParams.get('type')==='recovery'||resetHashParams.get('type')==='recovery';
const recoveryClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
  auth:{
    storageKey:'worshipflow-password-recovery',
    storage:window.sessionStorage
  }
});
let recoveryVerified=false;
let recoverySession=null;
let callbackHandled=false;
let callbackResolutionTimer=null;

function setResetStatus(heading,message,isError=false){
  document.getElementById('resetStatusHeading').textContent=heading;
  const messageElement=document.getElementById('resetStatusMessage');
  messageElement.textContent=message;
  messageElement.classList.toggle('reset-error',isError);
  document.getElementById('resetPasswordStatus').classList.remove('hidden');
  document.getElementById('resetPasswordForm').classList.add('hidden');
  document.getElementById('backToLogin').classList.remove('hidden');
}

function showResetPasswordForm(session){
  if(!recoveryVerified||!session)return;
  recoverySession=session;
  document.getElementById('resetPasswordStatus').classList.add('hidden');
  document.getElementById('resetPasswordForm').classList.remove('hidden');
  document.getElementById('newPassword').focus();
}

function showUnrelatedAuthCallback(){
  document.getElementById('resetPasswordStatus').classList.remove('hidden');
  document.getElementById('resetPasswordForm').classList.add('hidden');
  document.getElementById('resetStatusHeading').textContent='Email link verified';
  document.getElementById('resetStatusMessage').textContent='This link did not start a password reset. Return to the login page and sign in.';
  document.getElementById('backToLogin').classList.remove('hidden');
}

document.querySelectorAll('.password-toggle').forEach(button=>{
  button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.passwordTarget);
    if(!input)return;
    const visible=input.type==='password';
    input.type=visible?'text':'password';
    button.classList.toggle('is-visible',visible);
    button.setAttribute('aria-label',visible?'Hide password':'Show password');
    button.setAttribute('aria-pressed',String(visible));
  });
});

recoveryClient.auth.onAuthStateChange(async(event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    callbackHandled=true;
    if(callbackResolutionTimer)clearTimeout(callbackResolutionTimer);
    recoveryVerified=true;
    showResetPasswordForm(session);
    return;
  }
  if(event==='SIGNED_IN'&&hasAuthCallback&&!recoveryVerified){
    callbackResolutionTimer=window.setTimeout(async()=>{
      if(recoveryVerified)return;
      callbackHandled=true;
      const {error}=await recoveryClient.auth.signOut({scope:'local'});
      if(error){
        setResetStatus('Unable to finish sign-in safely',error.message,true);
        return;
      }
      showUnrelatedAuthCallback();
    },1500);
  }
});

document.getElementById('resetPasswordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!recoveryVerified||!recoverySession){
    setResetStatus('Reset link unavailable','This password reset link is invalid or has expired. Request a new reset email and try again.',true);
    return;
  }
  const password=document.getElementById('newPassword').value;
  if(password!==document.getElementById('confirmNewPassword').value){
    document.getElementById('resetPasswordMessage').textContent='The passwords do not match.';
    return;
  }
  const button=document.getElementById('updatePasswordButton');
  const message=document.getElementById('resetPasswordMessage');
  let passwordUpdated=false;
  button.disabled=true;
  button.textContent='Updating...';
  message.textContent='Updating your password...';
  try{
    const {error}=await recoveryClient.auth.updateUser({password});
    if(error)throw new Error(error.message);
    passwordUpdated=true;
    const {error:signOutError}=await recoveryClient.auth.signOut({scope:'local'});
    if(signOutError)throw new Error(`The password was updated, but the recovery session could not be cleared: ${signOutError.message}`);
    document.getElementById('resetPasswordForm').reset();
    document.querySelectorAll('.password-toggle').forEach(toggle=>{
      toggle.classList.remove('is-visible');
      toggle.setAttribute('aria-label','Show password');
      toggle.setAttribute('aria-pressed','false');
    });
    setResetStatus('Password updated','Your password has been changed. Return to WorshipFLOW and log in with your new password.');
    document.getElementById('resetStatusHeading').focus();
  }catch(error){
    if(passwordUpdated){
      document.getElementById('resetPasswordForm').reset();
      setResetStatus('Password updated',error.message,true);
    }else{
      message.textContent=`Unable to update password: ${error.message}`;
      button.disabled=false;
      button.textContent='Try again';
    }
  }
});

(async()=>{
  const {data,error}=await recoveryClient.auth.getSession();
  if(error){
    setResetStatus('Unable to verify reset link',error.message,true);
    return;
  }
  if(recoveryVerified&&data.session){
    showResetPasswordForm(data.session);
    return;
  }
  if(!hasAuthCallback){
    if(data.session){
      const {error:signOutError}=await recoveryClient.auth.signOut({scope:'local'});
      if(signOutError){
        setResetStatus('Unable to clear an unverified session',signOutError.message,true);
        return;
      }
    }
    setResetStatus('Reset link unavailable','This password reset link is invalid or has expired. Request a new reset email and try again.',true);
    return;
  }
  callbackResolutionTimer=window.setTimeout(async()=>{
    if(recoveryVerified||callbackHandled)return;
    const {data:currentSession,error:sessionError}=await recoveryClient.auth.getSession();
    if(sessionError){
      setResetStatus('Unable to verify reset link',sessionError.message,true);
      return;
    }
    if(currentSession.session){
      const {error:signOutError}=await recoveryClient.auth.signOut({scope:'local'});
      if(signOutError){
        setResetStatus('Unable to clear an unverified session',signOutError.message,true);
        return;
      }
    }
    setResetStatus('Reset link unavailable','This link did not verify as a password reset. Request a new reset email and try again.',true);
  },1500);
})();
