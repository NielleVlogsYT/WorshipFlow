const resetHashParams=new URLSearchParams(window.location.hash.slice(1));
const resetQueryParams=new URLSearchParams(window.location.search);
let hasRecoveryLink=resetHashParams.get('type')==='recovery'||resetQueryParams.get('type')==='recovery';
let recoverySession=null;

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
  if(!hasRecoveryLink||!session)return;
  recoverySession=session;
  document.getElementById('resetPasswordStatus').classList.add('hidden');
  document.getElementById('resetPasswordForm').classList.remove('hidden');
  document.getElementById('newPassword').focus();
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

supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    hasRecoveryLink=true;
    showResetPasswordForm(session);
  }
});

document.getElementById('resetPasswordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!hasRecoveryLink||!recoverySession){
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
    const {error}=await supabaseClient.auth.updateUser({password});
    if(error)throw new Error(error.message);
    passwordUpdated=true;
    const {error:signOutError}=await supabaseClient.auth.signOut({scope:'local'});
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
  const {data,error}=await supabaseClient.auth.getSession();
  if(error){
    setResetStatus('Unable to verify reset link',error.message,true);
    return;
  }
  if(!hasRecoveryLink||!data.session){
    setResetStatus('Reset link unavailable','This password reset link is invalid or has expired. Request a new reset email and try again.',true);
    return;
  }
  showResetPasswordForm(data.session);
})();
