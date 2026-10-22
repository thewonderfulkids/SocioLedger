export async function paymentSetupRequest(auth, societyId, body, publicOnly = false) {
  if (!auth.currentUser) throw new Error('Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api/payment-setup?societyId=${encodeURIComponent(societyId)}${publicOnly ? '&view=public' : ''}`, {
    method: body ? 'POST' : 'GET', headers:{ Authorization:`Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Secure payment setup is unavailable.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Payment setup is unavailable.');
  return result;
}
